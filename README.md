[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![make.fun rank](https://make.fun/badge/token-radar-01/julianzrn/token-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![make.fun reward](https://make.fun/badge/token-radar-01/julianzrn/token-radar/reward.svg)](https://make.fun/c/token-radar-01)

Contest entry: [Token Radar — make.fun](https://make.fun/c/token-radar-01)

# Token Radar — radar-2

A token launch radar for make.fun's token-radar-01 bounty. It reads the sealed DefiLlama
snapshot, ranks every pre-token protocol it may rank by implied value, and renders the board
as a static dashboard with a farm plan for every row.

## Reproduce it

One command, Node 22+, no packages to install (standard library only):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Run it twice: every output is byte-identical between runs, including `dossier.json`.
The robustness suite behind the numbers below is one more command:
`node validation/validate.mjs <path-to-snapshot.json>`.

## Results at a glance

Median |log error| of implied vs actual market cap, on the snapshot's 128 token-bearing
protocols — this model against the flat 0.25x baseline (radar-1's formula):

| Check | radar-2 | flat baseline |
| --- | --- | --- |
| Backtest on the calibration set | **1.03** | 1.63 |
| Out-of-sample split-half, both directions | **1.25 / 1.28** | 1.54 / 1.70 |
| 40 repeated random half-splits, mean | **1.26** | 1.58 |
| 9 parameter perturbations, error range | **0.99–1.14** | 1.63 |
| 6 segment cuts (TVL bands, thin categories, missing dates) | **wins all 6** | — |
| Most extreme member removed (rain, 400x) and refitted | **1.04, board #1 unchanged** | 1.61 |

## The model

radar-2 is fitted to the snapshot itself, on the 128 protocols that record a token and a
positive market cap:

- **Category multiples** — median market-cap/TVL per category, shrunk toward the global
  median in log space (pseudo-count 4), instead of one flat 0.25 for everything.
- **Growth** — 7-day TVL change clamped to [-60%, +120%]; its weight (0.85) is grid-searched
  on the calibration set.
- **Maturity** — older protocols price higher, on a fixed 0.6–1.0 curve over three years;
  unknown ages take the category's median age.
- **Size** — a least-squares term on the residuals: value per TVL dollar falls as TVL
  rises (fitted slope -0.36 against a $100M reference).

No protocol is ever priced by name: a protocol's category, chains, TVL, growth and age are
the only inputs, and the same fitted function scores every row. The dashboard's method
section prints the fitted values and the full category table.

## Robustness, and what was not shipped

The gates above are the floor, not the target. Before this version was frozen, a sweep of
richer variants was fitted and put through the same gates plus 40 repeated random
half-splits: shrinkage strengths from 1 to 12, Huber and L1 (median) losses for the size
term, a grid-fitted maturity curve, per-category growth weights, a chain-tier price term,
a growth interaction term, asymmetric growth weights, and ensembles of fits. Several win
on any single split — shrinkage 3, for instance, scores 1.18 on the split-half above —
but across the repeated splits none beats the shipped configuration consistently: every
variant's mean lands between 1.25 and 1.34 against the shipped 1.26, the two variants
that edge it on mean (by 0.006 and 0.0001) both lose on the median, and one of them is
far worse in-sample and on the split-half. The single-split wins do not replicate. They
were all discarded: at 128 calibration points those differences are split noise, and
shipping one would be fitting the validation split, not the market. The
full attempt ledger, with before/after numbers for every variant, is in
`OPTIMIZATION-V2.md`; the suite that produced every number is `validation/validate.mjs`.

Under the nine perturbations (shrinkage 2 and 8, growth clamps [-40, +80] and [-80, +200],
maturity floors 0.5 and 0.7, size references $50M and $200M, grid step 0.1), the model's
error stays in 0.99–1.14 and at least 9 of the board's top 10 survive every variant.

## Limitations, stated plainly

- Implied value is a relative pricing ruler built from one snapshot, not a prediction
  that a protocol will launch a token, or when, or at what price.
- The calibration set carries survivorship bias: it holds only protocols that did record
  a token and a positive market cap by the snapshot date.
- A median |log error| of 1.03 means the typical estimate lands within a factor of about
  2.8 of the recorded cap — good enough to rank, nowhere near precise enough to quote as
  a valuation.
- Fifteen records carry a market cap of exactly zero and are set aside as data artefacts;
  "records no token" is the snapshot's statement, not a claim about the real world.

## Outputs and layout

Outputs: `board.json` (the ranked board, 289 rows), `data.js` (the dashboard's data),
`dashboard/` (the static page), `screenshots/`, and `dossier.json`. The gate caps each
output at `board.json` ≤ 8 MiB, `dossier.json` ≤ 1.5 MiB, and `screenshots/` at 3–4 images
of ≤ 512 KiB each.

- `main.ts` — entry point: fit, rank, write, copy, dossier.
- `lib/model.ts` — snapshot parsing, the fitting procedure, the board, the farm plans.
- `lib/chains.ts` — chain cost tiers the farm plans quote.
- `vendor/makefun-board.ts` — the competition's dossier library, vendored unchanged.
- `dashboard/` — the static page: sortable, filterable, with a detail view per protocol.
- `validation/` — the robustness gate suite (`validate.mjs`, with its parameterized
  mirror of the fit in `harness.mjs` and the gate definitions in `gates.mjs`).
