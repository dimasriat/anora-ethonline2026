# Anora

Anora turns verified Indonesian electronic warehouse receipts into structured,
permissioned credit facilities without exposing sensitive commercial data.

Built for ETHOnline 2026, Classic / From Scratch track.

## The problem

Commodity producers and businesses frequently possess valuable inventories yet
remain constrained by inadequate liquidity, as their capital is locked in
storage until the goods are sold. Financial institutions are reluctant to lend
against commodities whose ownership, condition, and collateral status cannot be
verified with sufficient confidence. Although Indonesia's Sistem Resi Gudang
(SRG) was established to make stored commodities viable collateral, adoption
remains limited by fragmented infrastructure, weak institutional trust, and
restricted access to financing. Anora addresses this gap by using a verified
e-SRG to support a tokenized financing claim that can be divided into structured
positions for eligible capital providers. Through selective traceability, the
platform supplies the evidence required to assess the collateral without
exposing confidential commercial records, thereby broadening access to credit
while encouraging greater participation in the SRG ecosystem.

## What this builds

A financing facility backed by one e-SRG, issued as a permissioned security
token with fixed Senior and Junior tranches, where eligibility is proven in zero
knowledge rather than by disclosure.

- The **warehouse and the registry stay legally authoritative.** Nothing here
  claims to transfer receipt ownership on-chain; the token represents a lender
  claim, and the security interest is recorded the way Indonesian law requires.
- **Zero-knowledge is used only where it earns its complexity:** proving the
  request satisfies policy without revealing per-supplier purchase prices.
- **Permissioning is demonstrated by refusal.** An investor who fails the
  allowlist is shown being refused, not merely absent.

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

- **Panata Gama** — product, design, interface, and the demand that no claim
  outrun its evidence
- **Dimas Riatmodjo** — architecture, backend, contracts, circuits

## Licence

MIT. See `LICENSE`.
