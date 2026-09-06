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
| Eligibility proof generation | **live** | The circuit is written and proves in 2.5 s; 7 tests, 5 of which must fail |
| On-chain proof verification | **testnet** | Verifier deployed to Hedera testnet; a real proof verifies at 2,549,917 gas. Not yet called per request by the API |
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
| Eligibility proof verified on-chain | returns `true`, 2,549,917 gas |
| Transaction | `0x2c5a10fef7ce292f924e435e572a0efd824e49e490c92fb6b3c41f0608e3543e` |
| Verifier | `0x96daE21bB0Ba3529032de506DBd7d875D56D8DFb` |
| Local proving, real circuit | `execute` 2.8 s, `write_vk` 4.3 s, `prove` 2.5 s, `verify` 0.04 s |
| Proof size | 8,384 bytes, 10 public inputs |

The spike's probe circuit verified at 2,329,205 gas. The real circuit costs
2,549,917 — 9.5% more for six assertions and a Merkle membership check.

## Rules for this file

- A capability moves out of **planned** only when it runs end to end.
- **simulated, permanently** means there is no path to making it live within
  this project, and the reason is stated.
- No entry claims a mode it cannot demonstrate on request.
