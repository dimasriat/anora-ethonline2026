# Anora

Financing an Indonesian electronic warehouse receipt (e-SRG) for made tea —
before the tea is sold, and without publishing the cooperative's trade secrets.

Built for ETHOnline 2026, Classic / From Scratch track.

## The problem

A tea cooperative buys green leaf from smallholders, processes it into made tea,
and stores the result in a licensed warehouse. The warehouse issues an
electronic warehouse receipt. That receipt is already, by Indonesian law
(UU 9/2006), a security instrument that a bank can lend against — up to 70% of
appraised value.

In practice that channel barely runs for tea, and when it does the cooperative
gets one bilateral offer from one appointed bank, on terms it cannot compare.
Meanwhile the money is needed *now*: smallholders are paid on delivery, and the
tea sells months later.

Two things are missing, and neither is a lending-capacity problem:

1. **A market.** The receipt can back a loan today, but only through a single
   counterparty. Nothing lets several investors take different slices of the
   same facility at different risk.
2. **Privacy that survives disclosure.** Deciding whether a request is eligible
   requires knowing the purchase prices paid to each supplier. Those prices are
   the cooperative's most sensitive commercial data, and handing them to every
   prospective investor is not an acceptable cost of borrowing.

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
