#!/usr/bin/env node
// One-shot migration: encrypt every existing plaintext cert document in
// the tic-documents bucket. Idempotent — files already encrypted (BCLE
// magic header) are skipped.
//
// Run locally with the production env loaded:
//
//   SUPABASE_URL=… \
//   SUPABASE_SERVICE_ROLE_KEY=… \
//   CERT_DOC_KEY=… \
//   node scripts/encrypt-existing-cert-docs.js
//
// Or in dry-run mode (just lists what would change):
//
//   node scripts/encrypt-existing-cert-docs.js --dry-run

import crypto from "node:crypto";

const MAGIC = Buffer.from("BCLE", "utf8");
const VERSION = Buffer.from([0x01]);

const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const certKeyB64 = (process.env.CERT_DOC_KEY || "").trim();
const dryRun = process.argv.includes("--dry-run");

if (!supabaseUrl || !serviceKey || !certKeyB64) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or CERT_DOC_KEY");
  process.exit(1);
}
const certKey = Buffer.from(certKeyB64, "base64");
if (certKey.length !== 32) {
  console.error(`CERT_DOC_KEY must decode to 32 bytes (got ${certKey.length})`);
  process.exit(1);
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

// List every object recursively under the bucket
async function listAllPaths(prefix = "") {
  // Supabase storage list endpoint
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/list/tic-documents`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
  });
  if (!resp.ok) throw new Error(`list failed: ${await resp.text()}`);
  const items = await resp.json();
  const out = [];
  for (const it of items) {
    if (!it.id && it.name) {
      // Folder — recurse
      const sub = await listAllPaths(prefix ? `${prefix}/${it.name}` : it.name);
      out.push(...sub);
    } else if (it.name) {
      out.push(prefix ? `${prefix}/${it.name}` : it.name);
    }
  }
  return out;
}

async function downloadObject(path) {
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/tic-documents/${encodeURIComponent(path)}`, { headers });
  if (!resp.ok) throw new Error(`download ${path} failed: ${await resp.text()}`);
  return Buffer.from(await resp.arrayBuffer());
}

async function uploadObject(path, blob, contentType = "application/octet-stream") {
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/tic-documents/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": contentType, "x-upsert": "true" },
    body: blob,
  });
  if (!resp.ok) throw new Error(`upload ${path} failed: ${await resp.text()}`);
}

async function deleteObject(path) {
  const resp = await fetch(`${supabaseUrl}/storage/v1/object/tic-documents/${encodeURIComponent(path)}`, {
    method: "DELETE",
    headers,
  });
  if (!resp.ok) throw new Error(`delete ${path} failed: ${await resp.text()}`);
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", certKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, VERSION, iv, tag, ct]);
}

function findDocPathColumns() {
  // We update these tables' doc paths when we rename files.
  // (income/asset entries carry a docPath/doc_path column.)
  return [
    { table: "tic_income", column: "doc_path" },
    { table: "tic_assets", column: "doc_path" },
    // income_certifications.supporting_docs is a JSON column we can't easily
    // update via REST PATCH; admins re-upload after migration if needed.
  ];
}

async function updateDocPathReference(table, column, oldPath, newPath) {
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/${table}?${column}=eq.${encodeURIComponent(oldPath)}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ [column]: newPath }),
    }
  );
  if (!resp.ok) throw new Error(`patch ${table} failed: ${await resp.text()}`);
}

async function main() {
  console.log(`${dryRun ? "[DRY RUN] " : ""}Listing tic-documents…`);
  const paths = await listAllPaths();
  console.log(`Found ${paths.length} object(s).`);

  let encrypted = 0, skipped = 0, errors = 0;
  for (const path of paths) {
    try {
      const blob = await downloadObject(path);
      const hasMagic = blob.length >= 4 && blob.subarray(0, 4).equals(MAGIC);
      if (hasMagic) {
        console.log(`  ✓ already encrypted: ${path}`);
        skipped++;
        continue;
      }
      const newPath = path.endsWith(".enc") ? path : `${path}.enc`;
      console.log(`  ↻ ${path}  →  ${newPath}${dryRun ? "  (dry-run)" : ""}`);
      if (dryRun) { encrypted++; continue; }
      const encBlob = encrypt(blob);
      await uploadObject(newPath, encBlob);
      // Update any DB rows that reference the old path
      for (const { table, column } of findDocPathColumns()) {
        try { await updateDocPathReference(table, column, path, newPath); }
        catch (err) { console.warn(`    ⚠ couldn't update ${table}.${column}: ${err.message}`); }
      }
      // Delete the plaintext original
      await deleteObject(path);
      encrypted++;
    } catch (err) {
      console.error(`  ✗ ${path}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Encrypted: ${encrypted}, already-encrypted: ${skipped}, errors: ${errors}`);
}

main().catch(err => { console.error(err); process.exit(1); });
