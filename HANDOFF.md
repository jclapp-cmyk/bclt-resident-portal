# Handoff — HomeBase portal, Aug 31 2026

Delete this file when the Open items below are closed.

## Database state

All migrations below are **already applied to production**. There is one
Supabase project and no staging environment — `.env.local` holds the only
connection string, and running the app locally reads and writes production data.

## Done

### `697441f` — dashboard rent roll (not yet pushed)

The admin dashboard Financials card computed Monthly Rent from `rent_ledger`
while Financial Overview computed it from each resident's active lease. Those
disagreed. The dashboard now uses the lease-based source.

### This session

**Rent ledger view rewritten.** `supabase/rent-ledger-v2.sql` generated its month
series from `GREATEST(lease_start, current_month)`, which meant the series always
started at the current month — one month per resident, no history, contradicting
the file's own header. It also silently dropped residents: a lease starting in a
future month made `generate_series` run with start > stop, returning zero rows,
and the `CROSS JOIN LATERAL` removed that resident from the view entirely. That
was the cause of both "one resident missing from rent_ledger" and "payment saves
but does not display" — the payment was in `rent_payments` the whole time with no
ledger row to join to.

The series now runs from lease start to `GREATEST(current_month, lease_start)`,
so a past lease gets full history, a future lease gets exactly one row at its
first month, and no resident is ever billed for a pre-lease month. `start_date`
is `COALESCE`d because a NULL would otherwise produce zero rows and drop the
resident again.

**Prepayment support.** Both admin payment forms now have an `Applies To` month
picker beside the date field, which is relabelled `Date Received`. `month` is the
billing period the money covers; `payment_date` is when it arrived. The month
follows the date until edited, then holds. This is what makes a pre-move-in check
recordable against the month it actually pays for.

**Deposits routed out of `rent_payments`.** The `Security Deposit` pay type wrote
to `rent_payments` with the type recorded only in the note text, so the ledger
counted it as rent — a resident who paid rent plus deposit read 200% collected.
New `recordDeposit` in `src/lib/data.js` writes to `tenant_deposits` instead, and
`Applies To` hides for deposits since a deposit covers no billing month.

**Month selector clamped.** `selectedMonth` defaulted to the current month even
when the filtered ledger had no rows for it, so a future-lease property showed an
empty table beneath a dropdown displaying a different month — and could not be
corrected, since re-picking the only option fires no change event.
`effectiveMonth` falls back to the newest month that exists.

**Monthly Trend chart wired up.** `src/ResidentPortal.jsx` 5691 and 9722 built
`revenueData` from a hardcoded `[]` left over from the mock-data removal. Both
now derive from the ledger.

**10 Park Ave data corrected.** Resident prepaid rent and deposit by check before
a 2026-09 move-in. Three rows sat in `rent_payments` under `2026-08` (two test
entries plus the deposit). All removed; rent re-recorded against `2026-09`; the
deposit belongs in `tenant_deposits`. Ledger now reads one `2026-09` row, `paid`,
tenant paid equal to rent due.

## Open

1. **Nothing is deployed.** These changes are committed but not pushed, and the
   live site runs the old build against the new view. Until it ships: production
   reads $0 Monthly Rent for a future-lease property, its Payments tab shows an
   empty table for that property, its payment form cannot set a billing month,
   and deposits still land in `rent_payments`.

2. **`late_fee`, `utility`, and `other` have the deposit's bug.** They still
   write to `rent_payments` and count as rent collected. Deposit was special-cased
   because it had somewhere to go. The general fix is a `pay_type` column on
   `rent_payments`, with the ledger counting only `rent` toward `total_tenant`.
   Needs a migration and a backfill of existing rows.

3. **Re-record the 10 Park Ave deposit** through the payment form's Security
   Deposit type or the resident page's deposit form, using the original check
   date. It was deleted from `rent_payments` and not yet re-entered.

## Parked

Household members who signed the lease are invisible outside the Household tab.
`residents` is one row per unit and everything hangs off `resident_id`; `leases`
has no signer field. Jeff decided to leave the model as-is.

## Notes

`fetchResidentsExtended` falls back to `r.leases?.[0]` regardless of status,
while `rent_ledger` requires `status = 'active'`. Worth reconciling.

`20 Wharf Rd` (`20-wharf-rd-jcwt`) declares `total_units = 7` but has zero rows
in `units`. Not investigated.

`residents`, `leases`, and `rent_payments` are RLS-blocked for the anon key;
`rent_ledger`, `properties`, and `units` are readable. Diagnostics that need the
blocked tables have to run in the Supabase SQL editor.

Do not print resident names, rent amounts, or lease dates into a Claude Code
transcript. Write diagnostics that return verdicts and counts —
`supabase/diagnose-missing-ledger-resident.sql` is the pattern.
