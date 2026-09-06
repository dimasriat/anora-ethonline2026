# Spike: Hedera testnet and Noir proving

**Run 6 September 2026.** Everything below is measured, not recalled. Contracts
deployed here are throwaway probes for measurement; production contracts are
deployed separately.

## Toolchain

| | |
|---|---|
| bun | 1.3.14 |
| forge / cast | 1.8.1 |
| nargo | 1.0.0-beta.26 |
| bb (Barretenberg) | 5.2.0 |
| Network | Hedera testnet, chain id 296 |
| Gas price at run time | 1,080,000,000,000 wei |
| Deployer | `0xDB46DCbC36a9BB3fcaAd59EBce638f209Bf2629A` |

## What was tested and what held

Four assumptions were carried into this project from earlier work. Two did not
reproduce. Testing them was the point of the spike.

| Assumption | Result |
|---|---|
| Foundry's EIP-1559 defaults inflate the bill on Hedera | **Did not reproduce** |
| Hedera charges `gasLimit × maxFee` upfront, so the limit must be pinned | **Did not reproduce** |
| The mirror node's nonce lags consensus | **Reproduced** |
| `bb prove` needs `write_vk` to have run first | **Reproduced** |

## 1. Deployment: default versus pinned gas

Same contract, deployed twice.

| Method | Cost | Address |
|---|---|---|
| `forge create` defaults (EIP-1559) | 0.10692945 HBAR | `0x11d947f7060bEC3Fb3286bAc406f128B76efAc03` |
| `--legacy --gas-price <current> --gas-limit 4800000` | 0.10692945 HBAR | `0x9863146354085Aa3f87953b421264BD146c458C2` |

Identical to the rupiah. Hedera charged for gas consumed, not for the limit
requested, and the EIP-1559 path was not penalised.

**Conclusion:** pinning gas is not required for cost. It stays in the deploy
path only because an explicit limit fails fast and legibly instead of being
re-estimated mid-run.

## 2. Nonce reporting lags

Three `set()` calls issued back to back, reading the nonce from the RPC before
each:

| Call | Nonce reported before sending | Result |
|---|---|---|
| 1 | 26 | success |
| 2 | **26** | success |
| 3 | 28 | success |

The second read still returned 26 after call 1 had consumed it. All three
succeeded because `cast send` resolves its own nonce at submission time.

**Conclusion:** the lag is real, and it only bites code that reads a nonce and
then pins it manually. Do not do that. Let the signer resolve it.

Gas for the same function, cold versus warm storage:

| Write | Gas |
|---|---|
| First (`0 → 1`, cold slot) | 44,861 |
| Subsequent (warm slot) | 27,761 |

## 3. Proving order

`bb prove` without a verification key present:

```
Unable to open file: ./target/vk (No such file or directory)
```

**Conclusion:** `write_vk` must precede `prove`. Confirmed, and it fails with a
clear message rather than producing a bad proof.

Timings for a trivial circuit (`assert(value <= ceiling)`, one public input):

| Step | Wall clock |
|---|---|
| `nargo execute` | 1.065 s |
| `bb write_vk` | 0.124 s |
| `bb prove` | 0.558 s |
| `bb verify` (local) | 0.041 s |

Artifact sizes: proof 7,232 B · vk 1,888 B · public inputs 32 B.

These are a floor, not a forecast. The real eligibility circuit has a Merkle
membership check and an eight-element sum, and will cost more.

## 4. The Solidity verifier needs its libraries deployed first

`bb write_solidity_verifier` emits 103,917 bytes of source that compiles to
18,379 bytes of bytecode with two unresolved library references. `forge create`
refuses outright:

```
Error: Dynamic linking not supported in `create` command
```

Deploy order that works:

| Contract | Address | Cost |
|---|---|---|
| `RelationsLib` | `0x76906Bf3d47d8Bd36e094dFE55dd7b19A4ED44Ff` | 3.26927522 HBAR |
| `ZKTranscriptLib` | `0x63bA64B5Cb1349846f3109c4fDfBAed462EB1f11` | (combined above) |
| `HonkVerifier` | `0xe66b14Df380d3fcC6bb7a59ce60a928C326D6Ed6` | 4.11347976 HBAR |

Libraries first, then link both with `--libraries` on the verifier.

**This is the gotcha that costs the most time if unknown**, because the error
names neither library.

## 5. On-chain verification works, and what it costs

A proof generated locally, submitted to the deployed verifier:

| | |
|---|---|
| Result | `true` |
| Gas estimate | 2,527,186 |
| **Gas actually used** | **2,329,205** |
| Transaction | `0xe6e3709d2c7add55c53468c5e9e203f3ab39fb81711015313559961e6e067635` |
| Block | 40,169,183 |
| Explorer | https://hashscan.io/testnet/transaction/0xe6e3709d2c7add55c53468c5e9e203f3ab39fb81711015313559961e6e067635 |

The estimate ran 8.5% above actual.

**Conclusion:** verifying a proof on-chain is affordable on Hedera testnet and
returns a real boolean. Per-request on-chain verification is viable, so the
application must not report a hardcoded success — it has no excuse to.

## What this changes

- Deploy path keeps explicit gas for legibility, not for cost.
- Never read-then-pin a nonce.
- Library deployment is a required step in the contract deploy script, not an
  afterthought.
- On-chain verification is cheap enough to run for real. Anything that reports
  verification without performing it is a claim we cannot make.
