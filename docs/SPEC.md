# Specification

The implementation follows this document. Where the two disagree, this document
is wrong and gets fixed — not the other way round.

## 1. Instrument

A cooperative holds an Indonesian electronic warehouse receipt (e-SRG) over made
tea sitting in a licensed warehouse. It needs working capital before the tea is
sold.

**What is tokenized is a restricted lender claim against one financing facility.
It is not the receipt, and not the tea.**

Receipt ownership and the security interest over it remain with the licensed
warehouse and Pusat Registrasi (Bappebti). Nothing in this system transfers or
purports to transfer either. The token exists so that several investors can hold
different slices of one facility at different risk, and so that those slices can
change hands under a permission rule.

## 2. Who pays for gas

Visitors sign in with email or Google and receive a Privy wallet. They never fund
an account and never hold HBAR.

The platform pays gas as the facility operator. That is not a demo shortcut: a
tea cooperative will not top up a Hedera account, and an investor does not pay
gas to subscribe. The operator running the facility settles, which is how the
real product would work.

A facility belongs to the account that opened it. Another account's facility
reads as absent rather than forbidden — it is not theirs to know about.

Each account may hold a limited number of facilities, because every facility
deploys a contract and creates a wallet.

## 3. Who may act

Every action that moves value is gated behind a **liveness check** — World ID
Selfie Check, requested through IDKit and completed in the World ID app.

It gates three things: signing the financing mandate, approving the facility,
and subscribing to a tranche.

What it establishes: a live person is acting, they are not a script, and the
person returning is the one who verified.

What it does **not** establish, and must never be claimed to:

- **Uniqueness.** Selfie Check is 1:1 matching. It is not a one-person-one-account
  guarantee and cannot stop someone holding several accounts.
- **Identity.** It does not reveal who the person is.
- **Authority.** That an investor represents Bank Rakyat Sejahtera is KYB, which
  stays simulated.

## 4. Actors

| Actor | Authority | Not their authority |
|---|---|---|
| Cooperative (borrower) | Owns the receipt, signs the mandate, repays | Cannot approve its own facility |
| Licensed warehouse | Physical custody, issues the receipt | Does not own the tea |
| Pusat Registrasi | Records the security interest; confirmation gates disbursement | Does not lend |
| Facility Agent | Verifies evidence and authority, approves facility controls | **Does not lend.** Approval is separate from capital |
| Capital providers | Subscribe to Senior or Junior units | Cannot approve the facility they fund |

The cooperative signs through a Privy organisation wallet owned by a **2-of-3
key quorum** over its officers. A several-hundred-million-rupiah agreement is not
one officer's signature, and that is how cooperatives actually work.

The threshold is enforced by Privy, not by this application. A request carrying
one signature is refused with *"Number of signatures does not match the wallet's
authorization threshold"* before it reaches any of our code.

## 5. Facility terms

One approved e-SRG, one facility, fixed terms published before subscription
opens. No revolver, no bespoke per-lender terms.

| | |
|---|---|
| Receipt | `SRG-TEH-024` — 24,000 kg Black Tea BOP |
| Appraised value | Rp 600,000,000 (Rp 25,000/kg) |
| Policy maximum LTV | 7,000 bp (70%) |
| Facility ceiling | Rp 420,000,000 |
| Senior | Rp 270,000,000 at 200 bp, paid first |
| Junior | Rp 120,000,000 at 450 bp, absorbs loss first |
| Issued | Rp 390,000,000 |
| Unissued capacity | Rp 30,000,000 — headroom, not a reserve fund |
| Tenor | 90 days |

Junior is **30.77% of issued notes** (120/390). That is a share of the notes, not
a claim that the tea may lose 30.77% of its appraised value before Senior is
touched. See §7.

Loss attachment and detachment are stored facility terms, not inferred from the
tranche name:

| Tranche | Attachment | Detachment |
|---|---|---|
| Junior | Rp 0 | Rp 120,000,000 |
| Senior | Rp 120,000,000 | Rp 390,000,000 |

## 6. Lifecycle

```
draft → mandate_signed → approved → proven → tokenized → subscribed → funded → repaid
```

Each step names its owner and its gate:

| Step | Owner | Gate before it |
|---|---|---|
| `draft` | Cooperative | Receipt must be unencumbered and unexpired |
| `mandate_signed` | Cooperative | 2-of-3 organisation quorum reached |
| `approved` | Facility Agent | Mandate signed |
| `proven` | Facility Agent | Facility approved |
| `tokenized` | System | Eligibility proof verified. A permissioned note is deployed for this facility |
| `subscribed` | Capital providers | Every tranche filled to capacity. Each subscription allowlists the investor and allocates units on-chain |
| `funded` | Pusat Registrasi | Registry confirmation — gates disbursement **and** token activation |
| `repaid` | Cooperative | Facility funded |

Steps before tokenization are reversible; steps after it are not. Once the note
is issued and units are allocated, the record is on-chain, and rewinding the
screen would only make it lie about the state.

## 7. Eligibility proof

Zero knowledge is used only where it earns its complexity: proving the request
satisfies policy without disclosing what each supplier was paid.

Six assertions:

1. Per-supplier made tea sums to the quantity committed for this receipt.
2. Requested principal ≤ appraised value × policy LTV.
3. Requested tenor ≤ policy maximum tenor.
4. The receipt commitment is a member of the registry Merkle root.
5. The nullifier derives from (receipt, epoch) and has not been seen — one
   receipt cannot be financed twice in the same round.
6. The signed mandate hash matches the mandate on file.

**Public inputs** — visible on-chain, and therefore not private no matter what
the interface shows:

`registry root · mandate hash · epoch · appraised collateral value · requested
principal · policy LTV · policy tenor · requested tenor · nullifier`

**Private inputs** — never leave the prover:

`per-supplier made tea · per-supplier green leaf · per-supplier purchase price ·
receipt identifier · Merkle path and index · commitment secret · nullifier key`

The appraised value is a public input. Any claim that it is withheld is false,
and the prospectus must not make it.

## 8. Settlement waterfall

ATS partitions are ownership buckets. They do not enforce payment priority. A
separate deterministic settlement step does.

Let `C` be cash available after permitted costs.

```
paid_senior_return    = min(C, senior_return_due)
paid_senior_principal = min(C - paid_senior_return, senior_principal)
paid_junior_return    = min(C - senior_paid, junior_return_due)
paid_junior_principal = min(C - senior_paid - paid_junior_return, junior_principal)
residual              → receipt holder, only after all four are satisfied
```

Every subtraction floors at zero. Cash is conserved: the four payments plus
permitted costs plus residual equal cash received, up to explicitly tracked
rounding dust.

Repayment runs this waterfall and records the result on the request: what each
tranche was paid, what loss each absorbed, and whether cash was conserved.
Rupiah does not move — settlement is permanently simulated — but the allocation
is computed, not asserted.

## 9. Loss allocation

A separate function from payment priority.

```
tranche_loss(total_loss, attachment, detachment) =
    min(max(total_loss - attachment, 0), detachment - attachment)
```

For the issued structure: Junior absorbs the first Rp 120,000,000 of loss in
full. Senior loss is zero until Junior principal is completely exhausted.

Under the stated assumptions — Senior has absolute first claim, all net recovery
reaches noteholders, enforcement costs and time value ignored — Senior principal
begins to suffer only when net recovery falls below Rp 270,000,000, a 55% decline
from the Rp 600,000,000 appraisal.

That figure is a **deterministic structural threshold**. It is not expected loss,
not probability of default, not a rating, and not a guarantee. It ignores
enforcement cost, recovery delay, and price volatility, all of which are real.

## 10. Permissioning

Transfer is gated on the **receiving** side. Three checks, and all three must be
visible when they refuse:

1. Recipient is on the allowlist.
2. Recipient's mandate covers the tranche.
3. Sender holds the units being moved.

A permission system that is never seen refusing anyone has not been demonstrated.
One investor in the roster is deliberately not allowlisted for this reason.

## 11. What this does not claim

- That the token grants ownership of the tea, or of the receipt.
- That token partitions enforce payment priority. §6 does.
- That the structural threshold in §7 is a rating or a safety guarantee.
- That the original physical measurement or quality grading is accurate. The
  system inherits the licensed warehouse's assertion; it does not verify it.
- That any value listed as a public input in §6 is private.

## 12. Live versus simulated

Every capability reports its own mode and the reason for it. See
`docs/STATUS.md`. A demo that cannot name which parts are simulated is claiming
more than it has.
