# World ID integration feedback

Written while integrating Selfie Check (Beta) into Anora for ETHOnline 2026,
between 3 and 7 September 2026. Everything here is something that actually cost
us time, recorded when it happened rather than recalled at the end.

App `app_7312f45c0fa3bf4849f67f888f0a34be` · RP `rp_847b50fe15052cc9` ·
`@worldcoin/idkit-core` 4.2.4 · World ID Sandbox app on iOS via TestFlight.

## What went well

- **Access was granted quickly and the reply was clear.** The Sandbox TestFlight
  invitation and the note that Selfie Check could be invoked via IDKit arrived
  together, and the second half corrected a wrong assumption we had already made.
- **`signRequest` from `@worldcoin/idkit-core/signing` worked first try.** Small
  surface, obvious parameters, no ceremony.
- **The verify endpoint's errors are excellent.** `environment_mismatch` told us
  exactly what happened, which environment produced the proof, which one the
  request used, and what to do. That message saved an hour.
- **Sandbox as a concept is right.** Resettable accounts and controllable gating
  are exactly what integration testing needs.

## What cost us time

### 1. Selfie Check does not appear in the app, and nothing says so

We installed the Sandbox app, completed enrolment, looked for Selfie Check in
the interface, did not find it, and concluded our feature flag was not enabled.
It was.

Selfie Check is **relying-party initiated** — it appears when an app requests
it, never as a menu item. Obvious in hindsight, and it would have been obvious
up front with one sentence in the access-request documentation:

> Selfie Check will not appear inside the World ID app. It is requested by your
> integration; the app responds.

Cost: most of a day, and an unnecessary follow-up email to Tools for Humanity.

### 2. The `selfieCheckLegacy` example does not run as written

The documented snippet omits `allow_legacy_proofs`:

```ts
const request = await IDKit.request({ app_id, action, rp_context })
  .preset(selfieCheckLegacy());
```

It throws:

```
allow_legacy_proofs is required. Set to true to accept v3 proofs during
migration, or false to only accept v4 proofs.
```

The error is clear, but the page states Selfie Check uses World ID 3.0, so the
example could simply include `allow_legacy_proofs: true` and be copy-pasteable.

### 3. IDKit fetches a WASM binary from the page root, undocumented

IDKit requests `/idkit_wasm_bg.wasm` — 870 KB — relative to the page. Our server
had a catch-all that returned `index.html`, so the browser reported:

```
Failed to initialize IDKit WASM: CompileError: WebAssembly.instantiate():
expected magic word 00 61 73 6d, found 3c 21 64 6f
```

`3c 21 64 6f` is `<!do` — it was being handed HTML. The message describes the
symptom perfectly and points nowhere near the cause. The integration guide never
mentions that a WASM asset must be served, or from where.

**Suggestion:** one line in *Integrate IDKit* — "IDKit loads a WebAssembly module
from the application root; make sure `/idkit_wasm_bg.wasm` is served with
`Content-Type: application/wasm`."

### 4. The guide points at `staging`; the Sandbox app needs `sandbox`

This was the most expensive one, and the failure surfaced far from its cause.

*Integrate IDKit* says: *"To test during development, use the simulator and set
environment to `staging`."* We were testing with the **Sandbox app**, not the
simulator, and the two are different environments:

| `environment` | Connector domain | Handled by |
|---|---|---|
| `staging` | `staging.world.org` | the simulator |
| `sandbox` | `sandbox.world.org` | the World ID Sandbox app |
| `production` | `world.org` | the production World App |

With `staging`, iOS did not route the universal link to the Sandbox app. It fell
through to the **production** World App, which happily completed a real Selfie
Check. Everything looked successful — QR scanned, selfie taken, proof returned —
and only the verify endpoint caught it:

```
environment_mismatch — This proof was generated for the production environment,
but this request uses staging.
```

So a wrong environment value does not fail at request time, or at scan time, or
at proof time. It fails at the very end, after a human has already taken a selfie.

**Suggestion:** the Sandbox pages should state the `environment` value the
Sandbox app expects, and *Integrate IDKit* should distinguish simulator from
Sandbox rather than using "development" for both.

### 5. Same-device flow fails silently if polling lives in the page

Cross-device worked immediately: laptop shows the QR, phone scans, page updates.

Same-device did not. On a phone, opening the World App unloads the page, and an
in-page `pollUntilCompletion()` dies with it. Returning to the page produced:

```
failed: undefined
```

The error was empty because `pollUntilCompletion` returns a discriminated union
and never throws — so whatever we caught was not an `Error`.

We moved polling to the server and key it by our own session id, which is the
right design anyway. But nothing in the docs flags that the in-page pattern only
survives cross-device, and it is the pattern every example shows.

**Suggestion:** note that on same-device flows the page may unload, and show the
server-side pattern alongside the client one.

### 6. Forwarding the result "as-is" is not enough

*Step 5: Verify the proof in your backend* says:

> Forward the IDKit result payload as-is. No field remapping is required.

Doing exactly that returns:

```json
{"code":"validation_error","detail":"action is required for uniqueness proofs",
 "attribute":"action"}
```

`action` has to travel with the payload. Either the example should include it or
the sentence should be qualified.

## Smaller notes

- The iOS cold-start funnel includes an invite-code step for new accounts. Worth
  flagging on the Sandbox access page, since it is a third gate after the feature
  flag and tester access.
- The ETHOnline prize description calls Selfie Check "low-assurance" while the
  documentation calls it "medium-assurance". Minor, but they disagree.
- The documentation is admirably firm that Selfie Check is **not** a
  one-person-one-account guarantee. That saved us from building a claim we could
  not defend, and we would rather have that bluntness than a softer sentence.

## What we built with it

An eligibility gate before value-bearing actions in a warehouse-receipt
financing product: signing a financing mandate, approving a facility, and
subscribing to a tranche. The credential feeds an allowlist the token contract
checks before it will allocate or transfer units.

We deliberately do **not** claim it prevents multiple accounts. It gives us
liveness, abuse resistance and continuity, and the interface says so.
