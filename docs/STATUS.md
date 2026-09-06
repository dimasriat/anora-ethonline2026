# What is real

Updated as each capability lands. A demo that cannot name which parts are
simulated is claiming more than it has.

Last updated: 6 September 2026.

| Mode | Meaning |
|---|---|
| **live** | Runs for real, every time, with no stand-in |
| **testnet** | Real code against a real chain, but Hedera testnet — not money |
| **simulated** | Stands in for something we cannot reach |
| **planned** | Not built yet. Named here so it is never mistaken for built |

## Current state

| Capability | Mode | Why |
|---|---|---|
| Settlement waterfall | **live** | Pure computation, implemented and covered by 12 tests |
| Subscription screening | **live** | Allowlist, mandate, ticket and capacity gates, 10 tests |
| Eligibility proof generation | **planned** | Toolchain measured working in the spike; the real circuit is not written |
| On-chain proof verification | **planned** | Verifier deployed and measured in the spike at 2,329,205 gas; not yet wired to a request |
| ATS note issuance | **planned** | Not deployed for this repository |
| Allowlisted transfer | **planned** | Screening logic exists; no on-chain enforcement yet |
| Persistent storage | **planned** | In-memory. Deliberate for a deterministic demo |
| e-SRG documents | **simulated, permanently** | No real tea e-SRG exists to use. Warehouse receipts have covered tea since 2006, but the system is not running in practice. That gap is part of why this project exists |
| Registry confirmation | **simulated, permanently** | Pusat Registrasi (Bappebti) exposes no public API |
| Rupiah settlement | **simulated, permanently** | Requires a licensed payment partner |
| KYB and organisational authority | **simulated** | Real onboarding is out of scope for a hackathon |

## Measured, not claimed

From `docs/decisions/0001-hedera-noir-spike.md`, run 6 September 2026 on Hedera
testnet:

| | |
|---|---|
| On-chain proof verification | returns `true`, 2,329,205 gas |
| Transaction | `0xe6e3709d2c7add55c53468c5e9e203f3ab39fb81711015313559961e6e067635` |
| Local proving, trivial circuit | `write_vk` 0.124 s, `prove` 0.558 s, `verify` 0.041 s |

Those numbers come from a one-assertion probe circuit. The real eligibility
circuit will cost more, and this file will say so once it exists.

## Rules for this file

- A capability moves out of **planned** only when it runs end to end.
- **simulated, permanently** means there is no path to making it live within
  this project, and the reason is stated.
- No entry claims a mode it cannot demonstrate on request.
