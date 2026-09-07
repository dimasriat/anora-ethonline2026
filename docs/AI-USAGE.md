# AI usage

Required by the ETHGlobal rules:

> *"Clearly document in your submission where and how AI tools were used in the
> project. This includes specifying which parts of the code, specific files, or
> assets were generated or assisted by AI."*

This file is kept current as the project grows. If it disagrees with the
repository, the repository is right and this file is stale — say so rather than
trusting it.

## Tools

| Person | Tool |
|---|---|
| Dimas Riatmodjo | **Claude Code** (Anthropic), run from a Linux VPS |
| Panata Gama | **Google Stitch** and **FigJam** to ideate screens, **NotebookLM** to scope against the spec, and **Claude** to brainstorm domain research into a working interface. **Figma** for the component library. Source: his own *Design Decision* deck, 5 September 2026, "My Process & Tools" |

Gama's tools produced product decisions, screens and prose — not code committed
to this repository. His only commits here would be documentation.

No AI-generated images, audio, or video appear in the project. The Solidity
verifier is generated, but by `bb write_solidity_verifier` from the compiled
circuit — a compiler, not a model.

## Division of work

| | Who |
|---|---|
| Product decisions — the instrument, the actors, what the demo shows | **Panata Gama** |
| Adversarial review of claims — which numbers may be stated and with what denominator | **Panata Gama** |
| Architecture, direction, and every decision that closed off an option | **Dimas Riatmodjo** |
| Implementation, measurement, documentation | **Claude Code**, working from that direction |
| Anything requiring a human — faucet, account funding, third-party registration | **Dimas Riatmodjo** |

Commits written with AI assistance carry a `Co-Authored-By: Claude` trailer, so
`git log` shows which ones rather than leaving it to this file.

## Where AI wrote code

| Area | Files | Nature of the work |
|---|---|---|
| Eligibility circuit | `circuits/eligibility/` | Written by Claude Code from the six assertions specified in `docs/SPEC.md` §5. The shape — masked aggregation, Merkle membership, nullifier — came from prior human study |
| Contracts | `contracts/src/AnoraNote.sol`, tests | Written by Claude Code. The receiver-side gating rule was a human instruction |
| Domain and settlement | `packages/core/` | Written by Claude Code. Storing loss bands as data rather than inferring them from tranche names was a product decision from Gama |
| Backend | `apps/api/` | Written by Claude Code. The ports and adapters split, and the rule that an unbuilt capability must fail loudly, were human decisions |
| Interface | `apps/web/` | Written by Claude Code. Role ownership and hand-off framing follow Gama's storyboard |
| Documentation | `docs/`, `README.md` | Written by Claude Code from measured results and human decisions |

`contracts/src/Verifier.sol` is **generated**, not written, and is not committed.

## Corrections and decisions the humans made

The rules ask judges to see how the AI was directed, not only what it produced.
These are the moments where a human overruled or redirected the model.

**Gama — claims that did not survive review**

- *"31% Senior protection"* was refused. It is 120/390 of issued notes, which is
  a share of the notes, not a claim that the tea may lose 30.77% of its
  appraised value before Senior is touched. Every protection figure now names
  its denominator.
- The prospectus claimed the appraised value was withheld. It is a **public
  input** of the circuit, so the claim was false. It was removed, and
  `docs/SPEC.md` §5 now lists public and private inputs explicitly.
- Token partitions were being described as if they enforced payment priority.
  They do not; a separate settlement step does. `docs/SPEC.md` §6 and §9 exist
  because of that objection.
- Deterministic structural thresholds must never be presented as a rating,
  expected loss, or probability of default.

**Dimas — direction and rejected proposals**

- Rejected the lender offer book, which contradicted a note with fixed
  Senior/Junior partitions. Replaced with subscription into one fixed facility.
- Required that a capability which is not built must throw, not return a
  plausible success. That is why `proof.prove()` fails loudly when the circuit
  is unavailable.
- Required typed refusal codes end to end, so the interface can name which gate
  refused rather than showing one generic message.
- Required that the demo contain a party who is refused. One investor in the
  roster is deliberately not allowlisted.
- Corrected the tea valuation. The storyboard used Rp 75,000/kg; the trade price
  list in the Indonesia Tea Board deck puts bulk made tea at Rp 11,000–30,000/kg,
  so the demo used a figure 2.5 to 5 times the market. See
  `docs/decisions/0002-tea-valuation.md`.
- Required that carried-over assumptions be re-measured rather than trusted. Two
  of four did not reproduce; see `docs/decisions/0001-hedera-noir-spike.md`.

## Two defects the model introduced, and how they were caught

Reported here because a list of only successes would not be an honest account.

1. **The proof engine wrote into the repository.** It generated `Prover.toml`
   inside `circuits/eligibility/`, leaving the working tree dirty after every
   proof and letting two concurrent requests overwrite each other's witness.
   Caught by noticing an unexplained modified file, then fixed by running each
   proof in a temporary directory.
2. **The note could be activated while a tranche was unfilled.** The first
   deployment activated with the Senior tranche empty, because the allocation
   had failed and nothing checked. Caught by driving the contract on testnet
   rather than trusting the unit tests, then fixed with `TrancheNotFilled`.

Neither was found by review. Both were found by running the thing.

## Planning artifacts

`docs/SPEC.md` is the specification the implementation follows.
`docs/decisions/` holds the decision records, including measured experiment
results. `docs/STATUS.md` records what is live, testnet, simulated or planned.

All three are in this repository, as the spec-driven rule requires.
