// Vercel Serverless Function — Encrypted cert document download
//
// Authorizes the caller, fetches the encrypted blob from Supabase
// Storage via service role, detects the BCLE magic header, and either
// decrypts (encrypted format) or streams as-is (legacy plaintext, for
// backward compat during migration).
//
// Returns the decrypted bytes with the original content-type if the
// caller supplied one via ?ct=, otherwise application/octet-stream.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CERT_DOC_KEY

import crypto from "node:crypto";

const MAGIC = Buffer.from("BCLE", "utf8");
const HEADER_LEN = 4 + 1 + 12 + 16; // magic + version + iv + tag

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const certKeyB64 = (process.env.CERT_DOC_KEY || "").trim();

  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: "Supabase admin credentials not configured" });
  if (!certKeyB64) return res.status(500).json({ error: "CERT_DOC_KEY not configured" });

  let certKey;
  try {
    certKey = Buffer.from(certKeyB64, "base64");
    if (certKey.length !== 32) throw new Error("Key must be 32 bytes");
  } catch (err) {
    return res.status(500).json({ error: "Invalid CERT_DOC_KEY", details: err.message });
  }

  // ── Authenticate caller ──
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

  // ── Look up requester profile ──
  const profileResp = await fetch(
    `${supabaseUrl}/rest/v1/user_profiles?id=eq.${userId}&select=role,resident_id`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  const profiles = await profileResp.json();
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile) return res.status(403).json({ error: "Profile not found" });

  // ── Validate path ──
  const path = (req.query.path || "").toString();
  if (!path) return res.status(400).json({ error: "Missing path" });
  // Path should live inside tic-documents/{certId}/...
  const match = path.match(/^tic-documents\/([^/]+)\//);
  if (!match) return res.status(400).json({ error: "Invalid path" });
  const certId = match[1];

  // ── Authorize: cert must belong to caller OR caller is admin/PM ──
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

  // ── Fetch ciphertext from Supabase ──
  const blobResp = await fetch(
    `${supabaseUrl}/storage/v1/object/tic-documents/${encodeURIComponent(path)}`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!blobResp.ok) {
    const errText = await blobResp.text();
    console.error("Supabase fetch failed:", errText);
    return res.status(404).json({ error: "Document not found" });
  }
  const blob = Buffer.from(await blobResp.arrayBuffer());

  // ── Detect format & decrypt if needed ──
  let plaintext;
  const hasMagic = blob.length >= HEADER_LEN && blob.subarray(0, 4).equals(MAGIC);
  if (hasMagic) {
    const version = blob[4];
    if (version !== 0x01) {
      return res.status(500).json({ error: `Unknown encryption version: ${version}` });
    }
    const iv = blob.subarray(5, 17);
    const tag = blob.subarray(17, 33);
    const ciphertext = blob.subarray(33);
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", certKey, iv);
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (err) {
      console.error("Decrypt failed:", err.message);
      return res.status(500).json({ error: "Decrypt failed (wrong key or corrupted file)" });
    }
  } else {
    // Legacy plaintext — pass through during the migration window
    plaintext = blob;
  }

  // ── Stream back ──
  const ct = (req.query.ct || "").toString() || "application/octet-stream";
  const fname = (req.query.name || "document").toString();
  res.setHeader("Content-Type", ct);
  res.setHeader("Content-Length", plaintext.length.toString());
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fname)}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).send(plaintext);
}
