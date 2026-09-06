# Facility terms

**Locked 6 September 2026.** One approved e-SRG, one facility, fixed terms
published before subscription opens. No revolver, no per-lender negotiation.

## The terms

| | |
|---|---|
| Receipt | `SRG-TEH-024` — 24,000 kg Black Tea BOP |
| Appraised value | Rp 600,000,000 — see `0002-tea-valuation.md` |
| Policy maximum LTV | 7,000 bp |
| Facility ceiling | Rp 420,000,000 |
| Senior | Rp 270,000,000 at 200 bp, paid first |
| Junior | Rp 120,000,000 at 450 bp, absorbs loss first |
| Issued | Rp 390,000,000 |
| Unissued capacity | Rp 30,000,000 |
| Tenor | 90 days |

The ceiling is **derived**, not typed in: `floor(value × ltvBp / 10000)`. A
different receipt gets a different ceiling, so no receipt can quietly pass an
LTV test it should fail. The second seeded receipt gives Rp 158,760,000.

## Loss bands

Stored as data on the tranche terms, never inferred from the name:

| Tranche | Attachment | Detachment |
|---|---|---|
| Junior | Rp 0 | Rp 120,000,000 |
| Senior | Rp 120,000,000 | Rp 390,000,000 |

## The Rp 30,000,000 is headroom, not a reserve

It is the difference between what policy allows against the collateral
(Rp 420,000,000) and what was issued (Rp 390,000,000). Nothing is set aside, no
one is protected by it, and it must not be described as a cushion.

## Why not an offer book

The earlier design had several lenders bidding, and the borrower picking one.
That contradicts a note whose Senior and Junior partitions are fixed at
issuance: a bespoke winner cannot occupy a fixed partition structure meant for
several holders at different risk.

One facility with published terms, and investors subscribing into it, is the
model that matches the instrument.

## What the terms do not claim

- Junior at **30.77% of issued notes** is a share of the notes. It is not a
  claim that the tea may lose 30.77% of appraised value before Senior is
  touched.
- Under stated assumptions — Senior first claim, all net recovery reaching
  noteholders, enforcement cost and time value ignored — Senior principal begins
  to suffer below Rp 270,000,000 of recovery, a 55% decline from appraisal. That
  is a deterministic structural threshold. Not expected loss, not probability of
  default, not a rating, not a guarantee.
- The tranche names do not enforce priority. `packages/core/src/waterfall.ts`
  does.

## Open

Repayment currently releases the security and raises the round. Cash does not
move: rupiah settlement is permanently simulated, and no waterfall run is
attached to a repayment yet.
