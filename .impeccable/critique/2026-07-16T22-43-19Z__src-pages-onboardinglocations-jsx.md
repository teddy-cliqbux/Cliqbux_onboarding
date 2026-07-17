---
target: OnboardingLocations
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-07-16T22-43-19Z
slug: src-pages-onboardinglocations-jsx
---
Method: dual-agent (A: 3df3c473 · B: 2ef5d2ad)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong Still need / Save; header complete can disagree with Save (website/split) |
| 2 | Match System / Real World | 3 | Processing account language good; MCC codes + IRS/Legal Entity still processor-y |
| 3 | User Control and Freedom | 3 | Confirms/Back OK; incomplete combined hides Cancel; mailing autosave vs explicit Save |
| 4 | Consistency and Standards | 3 | Tokens consistent; 1×1 vs multi chrome diverge without teaching |
| 5 | Error Prevention | 3 | Sales rules + gated Save; Continue still invites a failed first click |
| 6 | Recognition Rather Than Recall | 2 | 12-code MCC wall; pencil-only edits; multi DnD easy to miss |
| 7 | Flexibility and Efficiency | 2 | DnD helps multi; 1×1 still forces full entity + processing before Banking |
| 8 | Aesthetic and Minimalist Design | 2 | Gold Wire restraint; first viewport still dense (banner + entity + store + processing) |
| 9 | Error Recovery | 3 | Named validation lists; some save errors still generic |
| 10 | Help and Documentation | 2 | MCC help + liquor notes; no explainer for Entity → Location → Account |
| **Total** | | **26/40** | **Acceptable — significant improvements still needed** |

## Anti-Patterns Verdict

**LLM**: Not SaaS-purple slop. Gold Wire holds — solid gold CTAs, dot+caption status, combined 1×1 drops nested duplicate-DBA cards. Residual product-form sludge: uppercase caption cadence everywhere, stacked gold left-rule callouts, muted gray helper density, multi-path nested MidCards (justified for org tree). Prior P1s (MCC escape hatch, sales Save gate) verified fixed in source.

**Deterministic scan**: `detect.mjs` exit 0 — **0 findings** (`[]`). Clean.

**Visual overlays**: Skipped — no running dev server; browser overlay injection unavailable this run. Fallback = CLI detector only.

## Overall Impression

The combined 1×1 panel is a real win for Porky's-class merchants. The step still asks them to finish legal-entity KYC and underwriting sales math on the same scroll before Banking — density and the MCC code wall are the bottleneck now, not nested chrome. Multi-location upgrade remains an IA cliff.

## What's Working

1. Combined 1×1 store panel — name/address + flat Card processing; no repeated DBA nested card.
2. Completeness model largely aligned — category + three sales figures shared across Save / isMidComplete / Continue messaging.
3. Honest escape hatches — MCC "Cliqbux will help," Advanced industry, liquor post-sign note.

## Priority Issues

### [P1] MCC dropdown is a wall of codes
- **What**: 12 options as `5812 — Restaurant…` plus Select + help.
- **Why**: Recognition fails; merchants guess or over-use help.
- **Fix**: Group by trade; plain labels first; keep help last.
- **Suggested command**: `$impeccable distill` (or `clarify`)

### [P1] Multi-location upgrade is an IA cliff
- **What**: Second location/account flips into rails, nested accounts, Move/DnD with no teaching beat.
- **Why**: 1×1 success confidence drops when org-chart chrome appears suddenly.
- **Fix**: One-time coach copy or staged reveal when hierarchy becomes real.
- **Suggested command**: `$impeccable onboard`

### [P2] Always-on verify left-rule banner
- **What**: Prefill verification callout sits above every entity every visit.
- **Why**: Burns gold scarcity; competes with the real task.
- **Fix**: Dismissible once, or only when prefilled/dirty; quieter tip under title.
- **Suggested command**: `$impeccable quieter`

### [P2] 1×1 still leads with legal chrome before the store
- **What**: Order is Entity → Business details → Mailing → Store/processing.
- **Why**: Merchant mental model is "my shop"; legal is secondary until Continue.
- **Fix**: Lead with store + Card processing; collapse legal into one required accordion.
- **Suggested command**: `$impeccable layout`

### [P3] Caption / muted-gray density
- **What**: Uppercase captions + gray-500 helpers dominate the processing form.
- **Why**: Softens hierarchy; contrast risk.
- **Fix**: Fewer uppercase labels; bump muted ink.
- **Suggested command**: `$impeccable typeset`

## Persona Red Flags

**Jordan (first-timer)**: Legal Entity / IRS Tax Classification / MCC codes before plain business language; verify banner feels accusatory; pencil edit easy to miss next to Trash.

**Casey (mobile)**: Long 1×1 scroll before Continue; tight icon targets; caption "Add another processing account" competes with primary CTA.

**Busy Owner (restaurant/retail, alone)**: Multiple Save rituals (Details / processing / address / mailing autosave); three sales + 100% split feels like a quiz; High-Risk Tavern can stall mid-flow; Delete on the only store sits next to pencil.

## Minor Observations

- Incomplete combined path hiding Cancel until complete is intentional — clarify primary as "Save to continue."
- `isComplete` ignores card-split/website while Save requires them — header can lie.
- StatusBadge "In Review" / "Awaiting approval" is processor-adjacent on a merchant KYC step.
- Delete confirms and Back modal are on-token and clear.

## Questions to Consider

1. Should Step 2 lead with the store for 1×1, with legal entity as a required drawer?
2. Is a one-time "You're now managing multiple stores" coach mark worth it on the second location?
3. Can Business Category be searchable plain language with MCC as agent detail?
4. Does the verify-prefill banner earn permanent gold left-rule, or should gold stay scarce for Save/Continue?
