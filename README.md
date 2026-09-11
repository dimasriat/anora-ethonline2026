# Anora

Anora turns verified Indonesian electronic warehouse receipts into structured,
permissioned credit facilities without exposing sensitive commercial data.

Built for ETHOnline 2026, Classic / From Scratch track.

## The problem

Commodity producers and businesses frequently possess valuable inventories yet
remain constrained by inadequate liquidity, as their capital is locked in
storage until the goods are sold. Although Indonesia's Sistem Resi Gudang (SRG)
was designed to make stored commodities viable collateral, participation
remains limited because the evidence required for financing is fragmented
across physical supply chains and difficult to share without exposing
commercially sensitive information. Anora introduces selective traceability by
linking warehouse and field attestations to cryptographic commitments, then
using zero-knowledge proofs to verify specific financing conditions without
revealing the underlying records. It makes financing conditional on a defined
set of verifiable claims. A verified e-SRG can then support a tokenized
financing claim divided into structured positions for eligible capital
providers, giving institutions clearer evidence while preserving the boundaries
of what the technology can prove.

## What this builds

One verified e-SRG backs one financing facility. That facility issues a
permissioned note in two tranches — Senior and Junior — whose capacity, return,
and loss bands are derived from the receipt and fixed before subscription opens.
Eligibility is proven against committed records rather than disclosed ones, and
every position is gated on who is permitted to hold it.

1. **The warehouse and the registry stay legally authoritative.** Anora moves
   neither the tea nor the receipt on-chain. What is tokenized is a restricted
   lender claim against one facility; the security interest is recorded through
   the existing SRG framework, and the registry step sits between subscription
   and funding.
2. **Zero-knowledge proves the request, not the paperwork.** A Noir circuit
   asserts six things about committed records: per-supplier made tea sums to the
   receipt quantity, principal is within policy LTV, tenor is within policy
   maximum, the receipt commitment is a member of the registry root, the proof
   is bound to this receipt key, and the signed mandate hash matches. It returns
   a nullifier over receipt and round, stable for that pair and nothing else,
   which is what makes a repeat financing in the same round detectable; a
   pledged receipt is separately refused at intake. Supplier identities,
   green-leaf weights, purchase prices, the receipt identifier, and the
   underlying documents stay private. Appraised value, requested principal, and the policy
   limits are public inputs — the proof withholds the commercial record, not the
   terms.
3. **Permissioning is demonstrated by refusal.** Subscription is screened on
   allowlist, tranche mandate, minimum and maximum ticket, and remaining tranche
   capacity. Transfer is gated on the receiving side and on what the sender
   actually holds, with pause and per-holder freeze available to the facility
   agent. The note contract carries the same allowlist and mandate rules and
   reverts by name — `NotAllowlisted`, `MandateExcludesTranche`,
   `ExceedsCapacity`. One investor in the roster is deliberately not
   allowlisted, because a permission rule never seen refusing anyone has not
   been demonstrated.
4. **Payment priority is computed, not implied by a tranche name.** Partitions
   are ownership buckets and enforce nothing about who is paid first. Repayment
   runs a deterministic waterfall — Senior return, Senior principal, Junior
   return, Junior principal, then residual to the receipt holder — and allocates
   loss through the attachment and detachment points stored on each tranche.
   Conservation of cash is checked rather than asserted.
5. **Cryptography does not establish physical truth.** The system inherits the
   licensed warehouse's assertion about quantity and grade; it does not verify
   the goods, and there is no inspector role in it. Acting on a facility is
   gated on a liveness check and on a 2-of-3 officer quorum for the
   cooperative's signature, while KYB, registry confirmation, and rupiah
   settlement stay simulated. `docs/SPEC.md` is the specification the
   implementation follows; `docs/STATUS.md` names the mode of every capability.

## Design process

The [Anora design process and tools](https://www.figma.com/board/He6V3rae674n4I8J1yJpmA/Anora-Design-Process-and-Tools?node-id=0-1&t=IBzqKLMS2LnwF2S4-1)
documents how the product flow and interface evolved. AI-assisted tools were
used to explore and compare early directions, while FigJam and Figma were used
to map the system, evaluate the alternatives, and refine the final design
before implementation.

## Status

Under construction during ETHOnline 2026 (September 4–13). This README describes
what the project is, not what is finished. Every component is labelled live,
testnet, simulated, or planned as it lands — `docs/STATUS.md` carries that table
and the measured figures behind it.

## Run the local demo

```bash
bun install
bun run demo:api
bun run dev:web -- --port 3334
```

Open `http://127.0.0.1:3334/`. The demo API runs the complete role workflow
without Hedera or identity credentials. The normal `start` and `dev:api`
commands continue to use the repository's configured adapters.

## DocuSeal signing

Copy `.env.example` to `.env`, add the DocuSeal Cloud API key, verified template
ID, and webhook secret, then configure DocuSeal to send `submission.completed`
to the public `/api/webhooks/docuseal` endpoint. The backend creates an
individual `/s/{slug}` signing session and only unlocks Compliance review after
the signed webhook passes `X-Docuseal-Signature` verification. The existing
shared `/d/Awg1hAT1aLHFsQ` URL identifies the form, not its numeric template ID.

## Provenance

This repository was started on 6 September 2026 and all code in it is written
during the hackathon.

The team's domain research predates it: the Indonesian warehouse-receipt system,
tea sector price data, and the product framing come from notes and conversations
that are not code and are not in this repository. Where a figure comes from an
outside source, the source is named at the point it is used.

## Team

1. **Panata Gama** — product direction, UX/UI design, frontend experience,
   structured finance, and evidence boundaries
2. **Dimas Riatmodjo** — protocol architecture, backend, smart contracts,
   zero-knowledge circuits, and integrations

## Licence

MIT. See `LICENSE`.
