# Handoff — HomeBase portal, Sept 2 2026

Delete this file when the Open items are closed.

## Ground rules

There is one Supabase project and no staging. `.env.local` holds the only
connection string, so running the app locally reads and writes **production
data**. Every migration below is already applied to production.

Do not print resident names, rent amounts, lease dates, or email addresses into
a Claude Code transcript. Write diagnostics that return verdicts and counts —
`supabase/diagnose-missing-ledger-resident.sql` is the pattern.

`residents`, `leases`, `rent_payments`, `user_profiles` and `message_threads`
are RLS-blocked for the anon key. `rent_ledger`, `properties`, `units` and
`tenant_deposits` are readable. Anything needing the blocked tables has to run
in the Supabase SQL editor.

## Shipped Aug 31 – Sept 2

**Rent ledger month generation.** The view generated its series from
`GREATEST(lease_start, current_month)`, so it always started at the current
month: one row per resident, no history. It also dropped residents outright — a
lease starting in a future month made `generate_series` run with start > stop,
returning zero rows, and the `CROSS JOIN LATERAL` removed them from the view.
That was the cause of both "one resident missing" and "payment saves but does
not display". The series now runs from lease start to
`GREATEST(current_month, lease_start)`, with `start_date` COALESCEd because NULL
would produce zero rows and drop the resident again.

**Prepayments.** Both admin payment forms have an `Applies To` month picker
beside `Date Received`. `month` is the billing period the money covers,
`payment_date` is when it arrived.

**Deposits.** `recordDeposit` writes the Security Deposit pay type to
`tenant_deposits`, not `rent_payments`, where it had been counted as rent.

**`rent_payments.pay_type`.** Only `pay_type = 'rent'` counts toward
`tenant_paid`; HAP is caught by pay type or method. Late fee, utility and other
count toward neither. All 18 pre-existing rows backfilled as rent.

**Arrears.** Totalled per resident across the window and floored once, so credit
from residents paying extra to catch up actually reduces what they owe.
Previously each month was floored independently and the excess discarded.
Starting balances are added once rather than per month. All six reporting sites
share `arrearsByResident`.

**Rent grace period.** Rent is due on the 1st with 7 days to pay
(`RENT_GRACE_DAYS`). Arrears stop at the last month past its grace window. On
Sept 1 this was showing ten of eleven residents delinquent and $14,458
outstanding against a real $3,135 and two residents.

**Rent History** per resident — every month since lease start, with paid,
short/over, and a status. Months before the first recorded payment read
"No records", not "Missed".

**Payments Received** on Financial Overview merges `rent_payments` and
`tenant_deposits` into one transaction list. The date-range control, which was
rendered but never applied, now filters it.

**Monthly Trend** shows a rolling 12 months instead of every month back to lease
start.

**Login diagnosis.** A resident looped between the sign-in page and their inbox
for days. Their magic link always worked; they had no `user_profiles` row, so
the app found no profile and re-rendered the sign-in screen with no message.
`/api/invite` creates the `auth.users` entry as a side effect of `generate_link`
while `inviteUser` creates the profile separately, so a failed profile insert
leaves an account that authenticates and cannot enter. Fixed by an invite that
happened to name their address. `inviteUser` now verifies the profile exists and
throws without sending mail if it does not; the login page explains the state;
the Residents list has a **Portal** column showing "Can sign in" / "No access".

## Open

1. **Ten of twelve active residents have no portal profile.** Residents →
   filter Portal to "No access" → invite each. They will all hit the login wall
   otherwise.

2. **The invite is two steps that can disagree.** `inviteUser` creates the
   profile from the browser under RLS; `/api/invite` creates the auth user with
   the service key. No shared transaction. Today's check makes divergence
   visible, not impossible. The fix is to move it all into `/api/invite` and
   reduce the client to a single fetch — a few hours with testing, and it
   removes the RPC / fallback / placeholder-UUID layering six earlier patches
   built up. Do not attempt mid-incident.

3. **Welcome email does not sign anyone in.** `cc33bcf` replaced the magic link
   with a plain portal URL, deliberately — a generated link is single-use and
   expires in about an hour, so most recipients would meet a dead button. Jeff's
   call on Sept 2 was to leave this alone. If revisited, the only version worth
   doing carries the address to a pre-filled sign-in box, at the cost of an
   email address in a URL.

4. **Views do not refresh until reload.** Payments and deposits were fixed;
   the messages view still loads threads on mount only. Three separate "it did
   not save" reports this session were all correctly written data that simply
   was not re-fetched. Worth handling generally.

## Parked

Household members who signed the lease are invisible outside the Household tab.
`residents` is one row per unit and everything hangs off `resident_id`; `leases`
has no signer field. Jeff decided to leave the model as-is.

## Notes

`fetchResidentsExtended` falls back to `r.leases?.[0]` regardless of status
while `rent_ledger` requires `status = 'active'`. Worth reconciling.

`20 Wharf Rd` (`20-wharf-rd-jcwt`) declares `total_units = 7` and has zero rows
in `units`.

`getAdjustedLedger` folds `startingBalance` into every month's balance, so never
aggregate `l.balance` across months — use raw due/paid and add the starting
balance once. `arrearsByResident` does this; anything new should too.
