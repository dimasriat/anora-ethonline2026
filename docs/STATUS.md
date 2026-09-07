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
| Settlement waterfall | **live** | Runs at repayment; 12 unit tests plus 7 covering the flow end to end |
| Subscription screening | **live** | Allowlist, mandate, ticket and capacity gates, 10 tests |
| Eligibility proof generation | **live** | Real circuit, run per request when `ADAPTER_PROOF=live`. 7 circuit tests, 5 of which must fail |
| On-chain proof verification | **testnet** | Called on every prove when `ADAPTER_PROOF=live`. A request that fails verification does not advance |
| Permissioned note | **testnet** | A note is deployed per facility. Subscription allocates on-chain, funding activates, repayment redeems |
| Allowlisted transfer | **testnet** | Enforced by the contract. An approved transfer succeeded; a transfer to an unapproved wallet reverted with `NotAllowlisted` |
| Persistent storage | **planned** | In-memory. Deliberate for a deterministic demo |
| e-SRG documents | **simulated, permanently** | No real tea e-SRG exists to use. Warehouse receipts have covered tea since 2006, but the system is not running in practice. That gap is part of why this project exists |
| Registry confirmation | **simulated, permanently** | Pusat Registrasi (Bappebti) exposes no public API |
| Rupiah settlement | **simulated, permanently** | Requires a licensed payment partner |
| Organisation wallet and quorum | **live** | Privy key quorum, 2 of 3 officers. Privy enforces the threshold; one signature is refused by Privy, not by this server |
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
| Note (manual proof of the gate) | `0x796fD9361A9119Aa9cdDBd3bc87522C2e9907baF` |
| Note deployed by the app | `0x4EFaF36bD75f5F48C8522aa3AFdF0c5Fd6949cA6` |
| Senior balance after subscription | 270,000,000 on-chain |
| Approved transfer | 61,229 gas, `0x3a2b381d…7d8e` |
| Refused transfer | reverted `NotAllowlisted`, `0x7aaecf3b…c06b` |

The spike's probe circuit verified at 2,329,205 gas. The real circuit costs
2,549,917 — 9.5% more for six assertions and a Merkle membership check.

## Rules for this file

- A capability moves out of **planned** only when it runs end to end.
- **simulated, permanently** means there is no path to making it live within
  this project, and the reason is stated.
- No entry claims a mode it cannot demonstrate on request.
