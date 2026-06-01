// Vercel Serverless Function — Encrypted cert document upload
//
// Accepts a base64-encoded file from the resident portal, encrypts it
// with AES-256-GCM using CERT_DOC_KEY (Vercel env var, never sent to
// Supabase), and uploads the ciphertext to the tic-documents storage
// bucket via the Supabase service role.
//
// Wire format: [4 bytes magic 'BCLE'][1 byte version 0x01][12 bytes IV]
//              [16 bytes auth tag][N bytes ciphertext]
//
// Env vars required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (service-role for bucket access)
//   CERT_DOC_KEY  (base64-encoded 32-byte key; generate with:
//                  openssl rand -base64 32)

import crypto from "node:crypto";

export const config = {
  api: {
    bodyParser: { sizeLimit: "25mb" },
  },
};

const MAGIC = Buffer.from("BCLE", "utf8");
const VERSION = Buffer.from([0x01]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const certKeyB64 = (process.env.CERT_DOC_KEY || "").trim();

  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Supabase admin credentials not configured" });
  if (!certKeyB64) return res.status(500).json({ error: "CERT_DOC_KEY not configured" });

  let certKey;
  try {
    certKey = Buffer.from(certKeyB64, "base64");
    if (certKey.length !== 32) throw new Error(`CERT_DOC_KEY must decode to 32 bytes (got ${certKey.length})`);
  } catch (err) {
    return res.status(500).json({ error: "Invalid CERT_DOC_KEY", details: err.message });
  }

  // ── Authenticate the caller via Supabase JWT ──
  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) return res.status(401).json({ error: "Missing authorization" });

  const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` },
  });
  if (!userResp.ok) return res.status(401).json({ error: "Invalid session" });
  const user = await userResp.json();
  const userId = user?.id;
  if (!userId) return res.status(401).json({ error: "Could not identify user" });

  // ── Look up the requester's profile (role + resident_id) ──
  const profileResp = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=role,resident_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const profiles = await profileResp.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  // ── Validate body ──
  const { certId, fileName, contentType, fileBase64 } = req.body || {};
  if (!certId || !fileName || !fileBase64) {
    return res.status(400).json({ error: "Missing certId, fileName, or fileBase64" });
  }

  // ── Authorize: cert must belong to caller, OR caller is admin/PM ──
  const isStaff = profile.role === "admin" || profile.role === "property_manager";
  if (!isStaff) {
    const certResp = await fetch(
      `${supabaseUrl}/rest/v1/income_certifications?id=eq.${certId}&select=resident_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const certs = await certResp.json();
    const cert = Array.isArray(certs) ? certs[0] : null;
    if (!cert) return res.status(404).json({ error: "Certification not found" });
    if (cert.resident_id !== profile.resident_id) {
      return res.status(403).json({ error: "Not authorized for this certification" });
    }
  }

  // ── Encrypt with AES-256-GCM ──
  let plaintext;
  try {
    plaintext = Buffer.from(fileBase64, "base64");
  } catch (err) {
    return res.status(400).json({ error: "Invalid fileBase64" });
  }
  if (plaintext.length === 0) return res.status(400).json({ error: "Empty file" });

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", certKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Wire: MAGIC(4) | VERSION(1) | IV(12) | TAG(16) | CT(N)
  const blob = Buffer.concat([MAGIC, VERSION, iv, authTag, ciphertext]);

  // ── Upload to Supabase Storage via service role ──
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `tic-documents/${certId}/${Date.now()}-${safeName}.enc`;

  const uploadResp = await fetch(
    `${supabaseUrl}/storage/v1/object/tic-documents/${encodeURIComponent(path)}`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/octet-stream",
        "x-upsert": "false",
      },
      body: blob,
    }
  );

  if (!uploadResp.ok) {
    const errText = await uploadResp.text();
    console.error("Supabase upload failed:", errText);
    return res.status(500).json({ error: "Upload failed", details: errText });
  }

  return res.status(200).json({
    path,
    size: plaintext.length,
    encryptedSize: blob.length,
    contentType: contentType || "application/octet-stream",
    fileName,
  });
}
