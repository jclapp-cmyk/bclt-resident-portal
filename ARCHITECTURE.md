# BCLT HomeBase — Architecture

*As of May 25, 2026*

## Overview

**BCLT HomeBase** is the resident, operations, and admin portal for the
Bolinas Community Land Trust — a non-profit landlord operating
affordable housing and Section 8 / LIHTC properties in West Marin.
It was previously known as the "BCLT Resident Portal" and was
re-branded "HomeBase" so the same app could serve staff and managers
without feeling resident-only.

There are three audiences:

- **Residents** — pay rent, view ledgers and lease docs, submit
  maintenance requests with photos, run through the four-step
  income certification (TIC) flow, manage household members and
  contact preferences, see inspections that affect their unit,
  exchange messages with the office.
- **Maintenance staff** — see and update only their own work orders,
  triage new requests, run inspections off shared templates, look up
  vendors, and message residents directly about repairs.
- **Admins (property management)** — everything: properties, units,
  residents, leases, financials, maintenance triage, income
  certification review, regulatory + unit inspections, vendor
  directory, communications, calendar, audit log, and settings.

The portal replaces a sprawl of spreadsheets, Gmail threads, paper
forms and ad-hoc texts with one signed-in surface. It also gives
residents a real self-service home for the things that historically
generated phone calls (rent balance, work-order status, recert
deadlines).

---

## Tech stack

- **React 19** + Vite 7 — single-page app, all UI in
  `src/ResidentPortal.jsx` (~9,800 lines).
- **Supabase** — Postgres database, Auth (magic links), Storage,
  and Row-Level Security. Accessed from the browser through
  `@supabase/supabase-js` (anon key) and from serverless functions
  via the service-role key for privileged operations.
- **Resend** — transactional email (notifications + branded welcome
  invites).
- **Twilio** — outbound + inbound SMS.
- **Google Apps Script** — polls the
  `residentportal@bolinaslandtrust.org` Gmail mailbox and POSTs
  inbound replies to the portal so they thread correctly.
- **Vercel** — static hosting for the SPA *and* host for the
  Node.js serverless functions in `api/`. Auto-deploys on push to
  `main` in GitHub.
- **heic2any** — lazy-loaded HEIC→JPEG conversion so iPhone photos
  uploaded to maintenance requests display correctly in
  Chrome/Firefox/Edge.
- **qrcode.react** — used to render unit-specific maintenance QR
  codes (deep links to the public maintenance form).

There is no separate backend service — everything lives in this one
repo: the React app, the SQL migrations, and the serverless
endpoints that bridge to Resend / Twilio / Gmail.

---

## Repo layout

```
bclt-resident-portal/
├── api/                   Vercel serverless functions (Node)
├── src/                   React SPA source
│   ├── ResidentPortal.jsx The whole UI (all pages, all roles)
│   ├── main.jsx           React entrypoint
│   ├── index.css          Minimal global styles
│   ├── assets/            Vite asset folder (logo, etc.)
│   └── lib/               Supabase + auth + data helpers
├── supabase/              SQL migrations + storage policies
├── public/                Static assets served at site root
├── index.html             Vite HTML shell — title is "BCLT HomeBase"
├── package.json
├── vite.config.js
└── .env.local             Local Vite env vars (not committed)
```

Key files:

- `index.html` — sets the browser tab title to "BCLT HomeBase".
- `src/main.jsx` — `createRoot(...).render(<App />)` from
  `ResidentPortal.jsx`.
- `src/ResidentPortal.jsx` — single-file React app: theme,
  components, page bodies, role-aware routing, search, dashboards,
  forms, modals, settings. The vast majority of behavior lives
  here.
- `src/lib/supabase.js` — Supabase client (anon key, `import.meta.env`).
- `src/lib/auth.js` — magic-link sign in, profile fetching via the
  `link_profile_on_login` RPC, user invitations.
- `src/lib/notify.js` — thin wrappers around `/api/notify`,
  `/api/send-sms`, and a `sendBoth` helper.
- `src/lib/data.js` — every CRUD call into Supabase: properties,
  residents, leases, maintenance, vendors, inspections, threads,
  income certifications, household members, staff, attachments,
  templates, property documents, AMI tables, audit log. (~1,500
  lines.)
- `api/notify.js` — Resend email send (templated + custom),
  plus-addressed reply-to.
- `api/send-sms.js` — Twilio outbound SMS.
- `api/inbound.js` — webhook the Gmail Apps Script posts to.
- `api/twilio-inbound.js` — Twilio inbound SMS webhook.
- `api/invite.js` — generates a Supabase magic link via admin API
  and sends a branded welcome email through Resend.
- `supabase/*.sql` — incremental migrations, RLS policy patches,
  storage bucket setup, and seed data. There is no single "current
  schema" file; the live schema is the cumulative result of these.

---

## Routing and roles

Routing is **hash-based**, driven by `window.history.pushState` and
the `popstate`/`hashchange` events:

- The current page id (`"dashboard"`, `"maintenance"`,
  `"work-orders"`, `"recert"`, `"property"`, etc.) is mirrored to
  `window.location.hash`.
- `setPage(id)` calls `pushState({ page: id }, "", "#id")` so each
  in-portal navigation creates a real browser history entry — the
  back/forward buttons feel native.
- A `popstate` + `hashchange` listener pulls the hash back into
  React state, so deep links and back-button navigations both work.
- A separate URL parameter (`?maintenance=<unitId>`) bypasses auth
  and renders the public maintenance request form (this is the
  target of the per-unit QR codes).

Three roles drive what NAV items render and which page components
mount. The `NAV` object in `ResidentPortal.jsx` (around line 572)
defines per-role sidebars:

- **resident**: Dashboard · Maintenance · Rent & Payments · Messages
  · Recertification · My Unit · Inspections · My Profile.
- **admin**: Dashboard · Properties · Maintenance Requests ·
  Communications · Residents · Finance · Income Certification ·
  Inspections · Reports · Calendar · Vendors · Settings.
- **maintenance**: Dashboard · Work Orders · Inspections ·
  Communications · Vendors · Schedule · My Profile.

A parallel `BOTTOM_TABS` config supplies a four-item mobile bottom
nav per role.

The admin sidebar also includes a **View As** toggle (visible only
to actual admins). It swaps the rendered role between admin / maint
/ resident without signing the user out, and — for the resident
view — exposes a `<select>` of every resident so admins can see
exactly what each household would see. Both selections are
persisted in `localStorage` (`bclt_viewAsRole`, `bclt_viewAsResident`).
The recently-reordered nav puts the most-used pages near the top
of each role's list — Maintenance, Communications, and Residents
above the longer-tail reports/calendar pages for admins; Rent and
Messages above Recertification for residents; Work Orders ahead of
Inspections for maintenance.

---

## Data model

The Postgres schema is split across `supabase/*.sql` migration
files (no single canonical schema dump). The major tables, with
their role and most important foreign keys:

**Properties and units**

- `properties` — one row per BCLT-managed building/site
  (`slug`, address, type, unit breakdown, finishes, manager
  contact, office hours, documents JSON).
- `units` — `property_id → properties`; per-unit bedroom/bath/sqft,
  appliances, finishes, AMI set-aside, unit type (apartment/RV),
  and last-inspection snapshot.
- `property_documents` — `property_id → properties`; storage path
  for plans, regulatory agreements, manuals, etc.

**Residents and households**

- `residents` — `property_id → properties`, `unit_id → units`. The
  primary lease-holder per unit. Has slug, contact channels,
  preferred channel, status, move-in date, household income/size.
- `household_members` — `resident_id → residents`. Spouses, kids,
  roommates. Used to populate income certification members and as
  a quick-fill source for inviting a co-resident.
- `leases` — `resident_id → residents`, `unit_id → units`. Term
  dates, rent amount, tenant portion vs HAP, status.
- `lease_documents` — `resident_id → residents`,
  `lease_id → leases`. Storage paths into the `lease-documents`
  bucket.

**People with portal access**

- `user_profiles` — primary key matches `auth.users.id`. Holds the
  app-side `role` (`resident | admin | maintenance`) and optional
  `resident_id` link. `resident_id` is intentionally **not
  unique** — multiple profiles can share one resident (co-resident
  support).
- `staff_members` — directory of property managers and maintenance
  staff who can be assigned work orders, separate from
  `user_profiles`. Includes role, contact info, and (optionally) a
  home property assignment.

**Maintenance**

- `maintenance_requests` — `resident_id → residents`,
  `property_id`, `unit_id`. Code (`MR-####`), category, priority,
  status (`submitted | in-progress | completed`), description,
  `assigned_to` text (matched fuzzily against staff names),
  `notes` JSONB log, projected/completed dates, photo URLs.

**Inspections**

- `unit_inspections` — per-unit inspections (annual / pre-HQS /
  pest / safety / etc.). `property_id`, `unit_id`, category, date,
  inspector, result, score, failed-items JSONB, notes.
- `reg_inspections` — building/property-level regulatory
  inspections (HQS, REAC/NSPIRE, fire, LIHTC, lead).
- `inspection_templates` — admin-authored custom checklists
  (sections JSONB, frequency, scoring mode).
- `inspection_checklists` — saved checklist instances tied to
  units (used by the maintenance staff to drive inspections from
  the field).

**Vendors**

- `vendors` — trade directory with license + COI expirations,
  active flag, notes. Vendor list import migration is the
  largest seed file (`vendor-list-import.sql`).

**Communications**

- `message_threads` — code (`THR-…`), participants JSONB (array of
  resident slugs or `["all"]` for broadcasts), subject, last
  message preview, last date, unread count, channel
  (`email | sms | phone | multi`), type (`direct | broadcast`),
  optional `priority`.
- `messages` — `thread_id → message_threads`, sender (`admin`,
  resident slug, or staff slug), body, sent_at, status.
- `comm_templates` — reusable subject + body templates per channel.

**Financial / compliance**

- `rent_payments` — `resident_id`, `property_id`, amount, method
  (`cash | check | money_order | hap | ach`), payment date,
  month (`YYYY-MM`), note.
- `rent_ledger` — computed view aggregating payments against the
  active lease, exposing tenant_paid / hap_received / balance /
  status per resident-month.
- `compliance_docs` — per-resident document inventory (lease /
  inspection / HUD form) with status and expiration.

**Income certification (TIC)**

- `income_certifications` — master row per resident per
  recertification: status, step-completion JSONB, household size,
  income totals, AMI determination, rent compliance, signatures,
  program type.
- `tic_household_members` — household snapshot at certification
  time.
- `tic_income_entries` — per-member income items (employment,
  social security, public assistance, other), verification doc
  path.
- `tic_asset_entries` — per-member assets (savings, investments,
  imputed disposed assets), cash value and annual income.
- `ami_reference` — Marin County AMI bands by household size
  (30/50/60/80/100 %).
- `ami_rent_limits` — Marin LIHTC rent caps by AMI percent and
  bedroom count.

**Misc**

- `admin_notes` — free-form internal notes per resident,
  admin-only.
- `audit_log` — generic insert/update/delete trail captured by
  `audit_trigger_fn()` and wired up to `residents`, `leases`,
  `maintenance_requests`, `rent_payments`, `vendors`,
  `unit_inspections`, `onboarding_workflows`, and `user_profiles`.
- `onboarding_workflows` — move-in / move-out step trackers per
  resident, status JSONB.
- `emergency_contacts` — per-resident emergency contact info
  (kept in `residents`-adjacent state, surfaced in admin views).

---

## Auth model

Sign-in is **passwordless** via Supabase Auth magic links:

1. User enters email on the login screen → `signInWithMagicLink`
   calls `supabase.auth.signInWithOtp` with
   `emailRedirectTo: window.location.origin`.
2. Supabase generates an OTP token and sends an email *from
   Supabase's domain*. For invites we send our own branded email
   instead (see `/api/invite` below). Either way the user lands
   back at the portal authenticated.
3. On the first authenticated session the client calls the
   `link_profile_on_login(user_email)` Postgres RPC. That function
   runs `SECURITY DEFINER`, finds the pre-created `user_profiles`
   row by email (which may still have a placeholder UUID), and
   updates its `id` to the real `auth.uid()`. It then returns
   enriched profile data (role, resident info, unit, property).
4. `fetchProfile` (in `src/lib/auth.js`) prefers the RPC's
   enriched response. If the RPC is unavailable it falls back to
   a direct `user_profiles` select that joins `residents → properties`.

The `user_profiles` table:

- `id` is the auth user id (`uuid`).
- `email` is unique.
- `role` is `resident | admin | maintenance` (CHECK constraint).
- `resident_id` references `residents(id)` but is **not unique** —
  multiple profiles can share one resident, which is how the
  portal supports co-residents (spouses, partners, adult
  household members all logging in with their own magic link
  while pointing at the same lease).

A second `link_profile_on_signup` trigger also runs on
`auth.users` inserts as a backstop.

`check_email_exists(text)` is exposed to `anon` and is used only
to give the login form a cleaner UX when an email isn't in the
system (it does not block sign-in — Supabase's generic OTP
response prevents enumeration).

---

## People model

This is worth calling out because three different tables describe
"people" with slightly different jobs:

- **`user_profiles`** — portal logins (residents, admin staff,
  maintenance staff). Admin-managed via the Residents page
  ("Portal Access" tab) for residents, and via Settings → Staff
  for staff.
- **`staff_members`** — directory of property managers and
  maintenance staff who can be **assigned work orders**. Often
  overlaps with `user_profiles` for staff who also have portal
  access, but `staff_members` can also list people with no portal
  account at all (e.g. a contract maintenance tech who only
  receives texts).
- **`residents`** — primary lease-holders, one per unit.
- **`household_members`** — spouses, kids, roommates tied to a
  `resident_id`. Used as the source of truth for income
  certification household composition and as a quick-fill source
  when an admin invites a co-resident to the portal.

The **Settings → Staff** tab manages `staff_members` and includes
an orphan-cleanup pass that removes stale entries.
Resident **portal access** is managed in **Residents → click a
resident → Portal Access tab**, which inserts the `user_profiles`
row (with a placeholder UUID), kicks off
`/api/invite`, and shows the link status.

---

## Storage buckets

Defined in the various `supabase/*.sql` migrations:

- `lease-documents` — **private**. Per-resident sub-folder layout.
  Admins read/write/delete; residents read and upload to their own
  folder only.
- `maintenance-photos` — **public**. Photos attached to maintenance
  requests (HEIC photos converted to JPEG client-side via
  `heic2any` before upload).
- `message-attachments` — **public**. Files attached to messages.
- `property-documents` — **private**. Plans, manuals, regulatory
  agreements, insurance docs, etc. Authenticated users only.
- `tic-documents` — **private**. Income / asset verification docs
  uploaded during the TIC flow.
- `inspection-attachments` — **private**. Photos and PDFs captured
  during inspections.

---

## API endpoints (serverless functions in `api/`)

All four endpoints are Vercel serverless Node functions; they live
beside the SPA and are deployed by the same Vercel project.

- **`api/notify.js` — outbound email via Resend.** Accepts
  `{ type, data }` and switches on a small set of templates
  (`maintenance_update`, `payment_receipt`, `rent_reminder`,
  `inspection_notice`, `custom`). The `from` address defaults to
  `BCLT HomeBase <residentportal@bolinaslandtrust.org>`. Crucially,
  the `reply_to` header uses **Gmail plus-addressing** so replies
  thread correctly:
  `residentportal+THR-<threadId>@bolinaslandtrust.org`.

- **`api/send-sms.js` — outbound SMS via Twilio.** Accepts `to` and
  `body`, normalises numbers to E.164, and uses either
  `TWILIO_MESSAGING_SERVICE_SID` (preferred) or `TWILIO_PHONE_NUMBER`
  as the sender.

- **`api/inbound.js` — inbound email webhook.** Called by the
  Google Apps Script attached to the
  `residentportal@bolinaslandtrust.org` Gmail mailbox. Extracts
  the thread code from the To: header (or as a fallback from the
  subject line via the `THR-…` pattern), matches the sender email
  against `residents.email`, and inserts a new row into `messages`
  attached to the right `message_thread`. Updates the thread's
  preview, last_date, and `unread` counter. Authenticates via
  `INBOUND_WEBHOOK_SECRET` if set.

- **`api/twilio-inbound.js` — inbound SMS webhook.** Configured in
  the Twilio Console as the destination for incoming texts.
  Normalises the From number to its last-10 digits, finds the
  matching resident in `residents`, then either appends the SMS to
  the most recent thread (within ~60 days) that has that resident
  in `participants`, or creates a fresh `message_threads` row
  titled "SMS from <name>". Always returns TwiML `<Response/>` so
  Twilio doesn't retry.

- **`api/invite.js` — branded welcome email with magic link.** Two
  steps:
  1. Calls Supabase's admin `POST /auth/v1/admin/generate_link`
     (`type: 'magiclink'`) using the service-role key to mint a
     login link without sending Supabase's default email.
  2. Sends a warm, branded welcome email via Resend with that link
     embedded as the call-to-action button.
  Has two flavours:
  - **Resident**: friendly tone, lists the things the resident can
    do (pay rent, submit maintenance, messages, paperwork,
    inspections).
  - **Staff (admin / maintenance / property_manager)**:
    operations-flavoured, lists the role's responsibilities (work
    orders, vendors, properties, financials).
  This replaces Supabase's bare default magic-link email so first
  contact with the portal feels intentional.

---

## Messaging flow (email + plus-addressing)

End-to-end for email-channel threads:

1. Admin opens **Communications → Compose**, picks an audience
   (single resident, multiple residents, broadcast to "all"), and
   sends.
2. App inserts a `message_threads` row (with a fresh
   `THR-<timestamp>` code) and the first `messages` row, then
   calls `sendNotification('custom', { to, subject, body, threadCode })`.
3. `/api/notify` hits Resend. `from` is
   `residentportal@bolinaslandtrust.org`; `reply_to` is set to
   `residentportal+THR-<code>@bolinaslandtrust.org`.
4. Resident hits **Reply** in their mail client. The reply goes to
   the plus-addressed alias.
5. Gmail delivers to `residentportal@bolinaslandtrust.org` and
   preserves the `+THR-<code>` tag in the original To: header.
6. A **Google Apps Script** running on the mailbox polls for new
   messages, parses the `+THR-…` tag, and POSTs to
   `/api/inbound` with `{ from, subject, body, threadCode, date }`
   and the `x-webhook-secret` header.
7. `/api/inbound` looks up the thread by code, resolves the
   sender's slug from `residents.email`, appends the reply to
   `messages`, and bumps `unread` on the thread.

The plus-addressing is the load-bearing trick: it keeps the visible
subject line clean while still giving the inbound side a reliable
machine-readable thread identifier.

---

## SMS flow

1. Admin sends an SMS from Communications (or any other place that
   surfaces a quick-SMS action) → `/api/send-sms` → Twilio →
   resident's phone.
2. Resident replies on their phone.
3. Twilio delivers the reply to the inbound webhook
   (`/api/twilio-inbound`).
4. The webhook normalises the From number, matches it against
   `residents.phone` by last-10-digits (so the `+1` prefix
   difference between Twilio and stored numbers doesn't break
   lookup), and either appends to the most recent thread that
   already includes that resident (within ~60 days) or creates a
   fresh `SMS from <Name>` thread.
5. The SMS lands in the admin Communications inbox alongside
   email-channel messages.

---

## Resident features

- **Dashboard** — large StatCards (Rent Balance, Open Requests,
  Income Cert status, Lease Status) that route to the relevant
  page on click. Below that: contact info card, six-month payment
  history sparkline, and recent communications.
- **Maintenance** — submit a request with category, priority,
  description, and **photo upload**. HEIC photos from iPhones are
  converted to JPEG client-side before upload via the lazy-loaded
  `heic2any`. View status of existing requests, see admin replies.
- **Rent & Payments** — ledger view, six-month chart, payment
  history with method, receipts.
- **Messages** — Communications page rendered in resident mode:
  view threads they're a participant in, send replies (email or
  SMS depending on `preferredChannel`).
- **Recertification** — four-step TIC flow: Household → Income →
  Assets → Sign. Documents upload to the `tic-documents` bucket.
  Shows the AMI determination, rent-compliance status, and program
  type computed from `ami_reference` + `ami_rent_limits`.
- **My Unit** — unit details (bedrooms, appliances, finishes),
  property info, lease docs the resident has access to.
- **Inspections** — past and upcoming inspections for the unit
  with results.
- **My Profile** — contact info, preferred channel, SMS consent,
  emergency contacts, household members.

---

## Maintenance role features

- **Dashboard** — "My Open Orders" stat (using fuzzy assignee
  matching so "Mike R." matches "Michael Rodriguez"), Unassigned
  count, Completed this month, plus a Recent Messages widget that
  links into Communications.
- **Work Orders** — top-tab layout: **Work Orders** (default) and
  **Archive** (admins also see an **Intake** tab; maintenance
  staff go straight to Work Orders). Includes a **+ New Request**
  button so techs can open a work order directly in the field
  without having to wait for a resident submission. "My Orders"
  filter uses the same fuzzy assignee matching as the dashboard.
- **Inspections** — run scheduled inspections, drive checklists
  off saved templates, capture photos to
  `inspection-attachments`, mark pass/fail/items.
- **Communications** — the same component as admin
  Communications (Inbox + Compose + Templates). Maintenance staff
  can DM residents about their own work orders or jump into
  existing threads.
- **Vendors** — read/update vendor directory.
- **Schedule** — shared calendar view, scoped to maintenance.
- **My Profile** — staff display name, contact info,
  notification preferences.

---

## Admin features

- **Dashboard** — clickable stats across maintenance, residents,
  rent, and inspections. Each card routes into the relevant page.
- **Properties** — property + unit management, finishes,
  appliances, lease docs, property documents, unit-level
  inspections.
- **Maintenance Requests** — three top tabs:
  - **Intake** — newly submitted requests that haven't been
    triaged.
  - **Work Orders** — assigned/in-progress.
  - **Archive** — completed.
  Triage moves rows from one tab to the next. Includes assignee
  selector (driven by `staff_members`), priority, projected
  completion, and an internal notes log.
- **Residents** — full resident roster with deep detail tabs:
  Overview · Household · Portal Access · Lease & Docs ·
  Maintenance · Payments · Communications · Notes. Portal Access
  is where admins invite resident logins and co-resident logins.
- **Communications** — multi-audience compose (single, many, or
  broadcast), template library, inbox view of every thread, SMS +
  email side-by-side.
- **Finance** — rent ledger, payment recording, late/balance
  rollups.
- **Income Certification** — review the resident's four-step TIC
  submissions, sign as admin, attach verification docs.
- **Inspections** — schedule unit + regulatory inspections,
  manage templates and saved checklists.
- **Vendors** — directory with license/COI tracking.
- **Reports** — rent collection, maintenance throughput, inspection
  status.
- **Calendar** — combined view of maintenance projected completion
  dates, inspection dates, lease end dates.
- **Settings** — property defaults, rent rules, maintenance
  categories, notification preferences, **Staff** tab,
  dark-mode toggle, and a destructive "reset all state" debug
  action.

---

## Recent architectural decisions

Most of these landed in the last set of sessions and are reflected
in the live code today:

- **People split.** Residents (lease-holders), household members
  (everyone else who lives there), and staff (people who do work
  orders) are now three distinct tables and three distinct UIs.
  Settings → Staff manages `staff_members`; Residents → Portal
  Access manages `user_profiles` per resident.
- **Co-resident support.** `user_profiles.resident_id` is no
  longer unique, so a spouse, partner, or adult household member
  can have their own portal login pointing at the same lease.
  The Portal Access tab pre-fills from `household_members` to
  make inviting them one click.
- **Branded invite emails via Resend.** New `/api/invite`
  endpoint generates a magic link through Supabase's admin API
  and sends a warm welcome email (resident vs staff flavour) via
  Resend. Supabase's default magic-link email is no longer the
  user's first impression of the portal.
- **Dashboard clickability.** Every actionable card and row on
  the resident, admin, and maintenance dashboards now routes to
  the right page on click. The dashboard is meant to be the jump
  table for the rest of the app.
- **Nav reordered by usage frequency.** Each role's sidebar puts
  the most-used pages near the top (e.g. Maintenance and
  Communications above Reports/Calendar for admins).
- **HomeBase rebrand.** Title tag, login screen, and outbound
  emails all say "BCLT HomeBase" — the same app now serves
  residents and staff and the resident-only framing was getting
  in the way.
- **Plus-addressed thread replies.** Email replies route via
  `residentportal+THR-<code>@bolinaslandtrust.org` so the Apps
  Script can match them back to threads without parsing subjects.
- **Maintenance role parity.** Maintenance now has full
  Communications access (Inbox / Compose / Templates), a "+ New
  Request" creation button, and fuzzy assignee matching for the
  "My Orders" filter so name variants don't break personal lists.

---

## Deployment

- **Hosting:** Vercel, auto-deploys on push to `main` in
  `jclapp-cmyk/bclt-resident-portal`.
- **Build:** `vite build` produces a static SPA in `dist/`;
  Vercel also picks up the functions in `api/` and deploys them as
  Node serverless endpoints under the same domain.
- **Production URL:** `https://bclt-resident-portal.vercel.app`
  (used as the default `PORTAL_URL` and as the redirect target for
  magic links).
- **Environment variables** that must be set in the Vercel
  project:
  - `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — exposed to
    the browser SPA.
  - `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — used by the
    serverless functions only.
  - `RESEND_API_KEY` — outbound email.
  - `FROM_EMAIL` — defaults to
    `BCLT HomeBase <residentportal@bolinaslandtrust.org>`.
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and one of
    `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_PHONE_NUMBER`.
  - `INBOUND_WEBHOOK_SECRET` — shared secret enforced by
    `/api/inbound` (set the matching value in the Apps Script).
  - `PORTAL_URL` — used by `/api/invite` as the magic-link
    redirect target.

Database migrations live in `supabase/` and are run by hand in the
Supabase SQL editor (no automated migration pipeline yet). The
auth schema, RLS policies, storage buckets, and seed data are all
shipped as separate `.sql` files that are intended to be applied
in roughly file-date order.
