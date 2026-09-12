# Anora

Anora connects holders of warehouse receipts (Indonesia - SRG) with capital
providers. It proves the financing conditions in zero-knowledge and issues the
claim as a permissioned note in Senior and Junior tranches, so a receipt holder
raises working capital without opening its books, and institutions subscribe
only to the risk their mandate allows.

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

**Collateral.** One or more verified e-SRGs, across any commodity the registry
covers, accepted into a single financing facility.

**Instrument.** A permissioned security token carrying that facility's own
Senior and Junior tranches, sized from the collateral and the policy.

**Terms.** Caps, yields, term, and asset mapping are fixed before anyone
subscribes, so no position is taken against a moving structure.

**Disclosure.** Eligibility is proven against committed records without
revealing them.

Four boundaries hold that together.

**The warehouse and the regulated registry stay legally authoritative.** Anora
does not move ownership of the receipt on-chain. The token is a financing claim
against the receipt; the security interest is recorded through the existing SRG
framework, where it is already enforceable.

**Zero-knowledge proves conditions, not documents.** A proof shows that
committed warehouse and field records satisfy the financing conditions. It
reveals no supplier identity, no purchase price, and none of the underlying
documents.

**Permissioning is enforced, not described.** Participation and transfers are
restricted to eligible capital providers. A subscription or transfer that fails
the allowlist or the tranche mandate is refused, and the refusal names which
rule stopped it.

**Cryptography carries evidence; people establish it.** Accredited inspectors
and warehouse operators attest to the physical goods, and Compliance makes
financing conditional on that evidence. The proofs protect those records and
disclose them selectively. They do not establish physical truth on their own.

## Design process

The [Anora design process and tools](https://www.figma.com/board/He6V3rae674n4I8J1yJpmA/Anora-Design-Process-and-Tools?node-id=0-1&t=IBzqKLMS2LnwF2S4-1)
documents how the product flow and interface evolved. AI-assisted tools were
used to explore and compare early directions, while FigJam and Figma were used
to map the system, evaluate the alternatives, and refine the final design
before implementation.

## Status

Under construction during ETHOnline 2026 (September 4–13). This README describes
what the project is, not what is finished. Every component is labelled live,
testnet, simulated, or planned as it lands — see `docs/STATUS.md` once the first
integrations are in.

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
