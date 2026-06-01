# Cert document encryption

All income-certification documents (pay stubs, tax returns, SS letters,
bank statements, etc.) are encrypted with **AES-256-GCM** before being
written to Supabase Storage. The encryption key lives in a Vercel
environment variable and is never sent to Supabase, so a Supabase-only
breach (database dump, storage leak, infrastructure compromise) yields
unreadable ciphertext.

## Wire format

Every encrypted object in the `tic-documents` bucket starts with a
five-byte header so legacy plaintext files can be detected and migrated:

```
[ 4 bytes  ASCII 'BCLE' magic ]
[ 1 byte   version (0x01)     ]
[ 12 bytes random IV          ]
[ 16 bytes GCM auth tag       ]
[ N bytes  ciphertext         ]
```

The download endpoint inspects the magic bytes and either decrypts
(magic present) or streams the file as-is (legacy plaintext, supported
during the migration window).

## One-time setup

### 1. Generate a 32-byte key

```bash
openssl rand -base64 32
```

Copy the output — it'll look like
`Qy7mZ2xJ8Vf9pK3LhR5tN6sW1AeI4oCdGuB0XvHbYjA=`.

### 2. Add it to Vercel environment variables

```
Settings → Environment Variables → Add New

  Name:          CERT_DOC_KEY
  Value:         <paste the base64 output>
  Environments:  Production, Preview, Development
```

Redeploy to pick up the new var (Vercel does this automatically when
you change env vars).

### 3. Verify the endpoints work

Sign into the portal as a resident, open Income Certification, attach a
document. The upload should succeed and the doc should appear in the
Supabase Storage `tic-documents` bucket with a `.enc` filename. Opening
the doc back in the portal should decrypt and display normally.

If you peek at the file directly in the Supabase dashboard, you'll see
binary garbage starting with `BCLE` — that's the encrypted blob.

### 4. Migrate any pre-existing plaintext docs (one-time)

If certs have been uploaded before this change, run the migration:

```bash
# Dry run first to see what would change
SUPABASE_URL='https://xxxxx.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='eyJ…' \
CERT_DOC_KEY='Qy7mZ2x…' \
node scripts/encrypt-existing-cert-docs.js --dry-run

# Then for real
SUPABASE_URL='https://xxxxx.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='eyJ…' \
CERT_DOC_KEY='Qy7mZ2x…' \
node scripts/encrypt-existing-cert-docs.js
```

Already-encrypted files are skipped, so the script is safe to run
multiple times.

## Key rotation

To rotate the key:

1. Generate a new key.
2. Write a one-shot script that downloads each `.enc` file, decrypts
   with the old key, re-encrypts with the new key, re-uploads.
3. Update `CERT_DOC_KEY` in Vercel and redeploy.

This isn't urgent — AES-256-GCM keys don't need frequent rotation.
Annual rotation is more than sufficient for this use case.

## What this protects against

- ✅ Supabase infrastructure breach
- ✅ Supabase employee accessing raw storage
- ✅ Database dump / backup leak
- ✅ Subpoena to Supabase (they can hand over ciphertext only)

## What this does NOT protect against

- ❌ Vercel infrastructure breach (attacker would have the key)
- ❌ Compromised admin/resident account (they go through the app, which
      decrypts on their behalf — same as today)
- ❌ Code-level vulnerabilities (XSS, etc.) — those are mitigated by
      RLS + standard React escaping

If the Vercel-env approach feels insufficient down the line, the
upgrade path is **AWS KMS or Google Cloud KMS**: the key never leaves
the KMS provider, and the Vercel function calls KMS for each
encrypt/decrypt. Adds ~$1/month and ~4 hours of setup. The wire format
above is forward-compatible — the version byte lets us roll out new
key-wrapping schemes without touching old files.

## Files involved

- `api/cert-upload-doc.js` — encrypt + upload
- `api/cert-download-doc.js` — decrypt + stream
- `src/lib/data.js` — `uploadTICDocument` / `getTICDocumentUrl` hit the API routes
- `scripts/encrypt-existing-cert-docs.js` — one-shot migration helper
