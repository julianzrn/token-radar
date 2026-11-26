# Transcript — token-radar-01 entry (radar-2)

Build log of the entry in this repository. The design this follows is in DESIGN.md (research
phase); this file records what was actually built and measured, phase by phase.

## Phase 1 — value model and data layer (2026-11-25)

Built `lib/model.ts` (the fitted model), `lib/chains.ts` (chain cost tiers), `main.ts`
(the kit's program contract: fit → rank → write board.json/data.js → copy dashboard and
screenshots → dossier), `vendor/makefun-board.ts` (kit original, sha256
9ca51b6e5cd84fe46cb0efa61e2ea99365a1fb0e21f2b75e6007f977f0dc326e, byte-identical to
kit.json), LICENSE (MIT), README.md, .makefun/owner.json.

### The model as fitted at runtime on the sealed snapshot
- Calibration set: 128 protocols (mcap_usd present and > 0; 15 further records carry a
  zero market cap and are set aside as data artefacts). Global median mcap/TVL = 0.2138.
- Category multiples: per-category median, shrunk toward the global median in log space,
  pseudo-count 4. Growth weight: 0.85 (grid search 0..1 step 0.05, median |log error|).
  Size term: slope -0.3562 against a $100M reference (least squares on residuals).
- Backtest on the calibration set: median |log error| 1.0257 for radar-2 vs 1.6317 for
  the flat radar-1 formula on the same 128 protocols.

### Revision made during this phase (with the reason)
The first fit used arithmetic shrinkage; it priced the one-peer Prediction Market
category at an 80.2x multiple (its single calibration member records a market cap 400x
its TVL), putting a $320M protocol at rank 1 with a $12.8B implied value. Shrinkage was
changed to log space, which prices that category at 0.96x and restores a sane board,
at a small in-sample cost (median |log error| 0.9562 → 1.0257). Robustness on the
board that is judged beats squeezing one outlier in the fit sample.

### Self-check (driver script against lib/model.ts, kit snapshot)
- Board rows: 289 (all rankable pre-token protocols), watchlist coverage 40/40,
  early rows 249, live (token-bearing) rows set aside: 416.
- boardIssue: null. Farm steps: 6 per row, trimmed lengths 151–298 chars (gate: 20–600).
- board.json: 531,117 bytes (cap 8 MiB). data.js: 603,052 bytes. Build time ~15–106 ms.
- Top of the board: wbtc, coinbase-bridge, base-bridge, binance-bitcoin, usdt0 —
  the large bridge/curator protocols; polymarket-international ranks 8th at $192M.

## Phase 2 — dashboard and screenshots (2026-11-25)

Built `dashboard/index.html` + `app.css` + `app.js` (29,080 bytes total, budget 60 KB;
the dossier text cap is 65,536). No framework, no external asset, no http(s) string
anywhere in the three files. The page reads only ../data.js.

- Views, all hash-routed so any state can be screenshotted directly: the board
  (sortable by rank/name/TVL/7d/age/implied; filters for category, chain, minimum TVL,
  watchlist-only, and text search; first 60 rows with a show-all button), a detail view
  per protocol (stat cards, the full price breakdown — TVL x category multiple with the
  raw median shown next to the shrunk one, x growth, x maturity, x size — and the
  six-step farm plan), an already-trading view (all 416 token-bearing protocols at
  actual market caps, kept apart from the ranking), and a method view (formula, the
  fitting procedure, the backtest numbers, and the fitted category table).
- Screenshots: the local headless chain from DESIGN §六.4 (Playwright-cache Chromium
  over a local static server) — no cloud fallback needed. 1-board.png 1280x800 /
  133,580 B; 2-detail.png 1280x1240 / 216,922 B (Polymarket International: the detail
  shows the 400.20x raw median shrunk to 0.96x, the complete breakdown to $192,029,168,
  and farm steps 1–5); 3-filtered.png 1280x800 / 128,717 B (category filter: Lending,
  16 of 289).

### Final verification (this build)
- `node main.ts` run twice into separate output dirs: every file byte-identical,
  including dossier.json (determinism gate).
- All seven sealed gates reconstructed locally against the output: dashboard files
  (3 files, 29,080 B, no network address), board_file (289 rows, all fields valid,
  531,117 B), sorted_by_value, coverage 40/40, farm_steps (6 per row, 151–298 trimmed
  chars), screenshots (3, dims and sizes within caps), dossier_matches (byte-identical
  to a fresh buildDossier, 669,523 B ≤ 1.5 MiB).

### State handed to the next phase
Phases 1–2 are complete and locally green. Nothing has been submitted (the 10-submission
budget is untouched) and no GitHub repository has been created from this directory.
Phase 3 pre-submission hardening is now complete (see the Phase 3 section below); the
next step is the first development submission probe via the kit CLI, to read the
provisional win rate and the judge's reasons.

## Phase 3 — pre-submission hardening (2026-11-26)

A read-only audit and robustness re-check of the sealed entry before the first probe
submission, plus three small hardening edits (below). No model logic, dashboard,
screenshot or vendored file was changed in this phase.

### Robustness re-checks (all on the kit snapshot)
- Reproducibility: `node main.ts` run twice on the kit snapshot produced byte-identical
  output files. Fitted values: growth weight 0.85, size slope −0.3562, in-sample median
  |log error| 1.0257 (baseline 1.6317).
- Out-of-sample split-half: splitting by slug parity, fitting on one half and scoring
  the other in both directions, the out-of-sample median |log error| is 1.2520 / 1.2789,
  against the baseline on the same footing at 1.5446 / 1.7006 — the model still beats
  the baseline out of sample, so the in-sample win is not overfitting.
- Parameter perturbation: with shrinkage_k ∈ {2, 8}, growth clamping ∈ {[−40,80],
  [−80,200]}, maturity floor ∈ {0.5, 0.7}, size reference ∈ {$50M, $200M} and grid step
  0.1, the model error stays in 0.99–1.14 (baseline 1.63) and the top-10 overlap is
  9–10/10 in every variant.
- Segmented error: the model beats the baseline in every segment — TVL <$25M 1.06 vs
  1.72; $25–100M 1.15 vs 1.24; $100M–1B 1.10 vs 1.40; >$1B 0.60 vs 2.00; thin categories
  (≤3 peers) 1.13 vs 2.17; listed_at missing 1.47 vs 1.87.
- Outlier influence: removing rain, the most extreme calibration member
  (mcap/TVL = 400.2x), and refitting moves the error 1.0257 → 1.0357, keeps the top-10
  overlap at 9/10, and leaves #1 unchanged (wbtc).

### Seven gates, locally re-checked — all pass
- dashboard: 3 files, 29,080 B, no network address in any file.
- board_file: 289 rows, all fields valid.
- sorted_by_value: board sorted by implied value, descending.
- coverage: 40/40 watchlist slugs present.
- farm_steps: 6 steps per row, 151–298 characters each.
- screenshots: 3 images, dimensions and sizes within caps.
- dossier_matches: dossier.json 669,523 B, with text 29,344 B and no truncation.

### Hardening edits made in this phase
- `lib/model.ts`: corrected two comments only — the header backtest figure updated
  from about 0.93 to about 1.03 against radar-1's 1.63, and the buildBoard note
  clarified so the dataset's $5M TVL inclusion threshold is not conflated with
  snapshot.floor_usd ($50M, the watchlist threshold). No code logic changed.
- `main.ts`: two defensive checks added — screenshots above the gate's maximum of 4
  now fail as the below-3 case already did, and a board whose row count falls outside
  100–4000 fails before board.json is written.
- `README.md`: added a Robustness section reporting the out-of-sample, perturbation
  and outlier results above, and stated the per-output gate caps in the Run it section.
