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

A financing facility backed by one verified e-SRG, issued as a permissioned
security token with facility-specific Senior and Junior tranches whose terms are
fixed before subscription, where selective traceability and eligibility are
proven without disclosing confidential commercial records.

1. The **warehouse and regulated registry remain legally authoritative.** Anora
   does not transfer ownership of the receipt on-chain; the token represents a
   financing claim, while the security interest is recorded through the
   existing SRG framework.
2. **Zero-knowledge is applied.** It proves that committed warehouse and field
   records satisfy defined financing conditions without revealing supplier
   identities, purchase prices, or underlying documents.
3. **Permissioning is demonstrated through enforcement.** Participation and
   transfers are restricted to eligible capital providers, and transactions
   that fail the allowlist or tranche mandate are explicitly refused.
4. **Technology supports institutional trust.** Accredited inspectors and
   warehouse operators attest to the physical goods, while Compliance reviews
   that evidence and makes financing conditional on verified records.
   Cryptography protects and selectively proves those records; it does not
   establish physical truth by itself.

## Status

Under construction during ETHOnline 2026 (September 4–13). This README describes
what the project is, not what is finished. Every component is labelled live,
testnet, simulated, or planned as it lands — see `docs/STATUS.md` once the first
integrations are in.

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
