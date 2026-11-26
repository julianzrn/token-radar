[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)

# Token Radar — radar-2

A token launch radar for make.fun's token-radar-01 bounty. It reads the sealed DefiLlama
snapshot, ranks every pre-token protocol it may rank by implied value, and renders the board
as a static dashboard with a farm plan for every row.

## The model

radar-2 is fitted to the snapshot itself, on the 128 protocols that record a token and a
positive market cap:

- **Category multiples** — median market-cap/TVL per category, shrunk toward the global
  median (pseudo-count 4), instead of one flat 0.25 for everything.
- **Growth** — 7-day TVL change clamped to [-60%, +120%]; its weight is grid-searched on
  the calibration set.
- **Maturity** — older protocols price higher, on a fixed 0.6–1.0 curve over three years;
  unknown ages take the category's median age.
- **Size** — a least-squares term on the residuals: value per TVL dollar falls as TVL
  rises (fitted slope about -0.36 against a $100M reference).

Backtested on its own calibration set, the fitted model's median |log error| is 1.03,
against 1.63 for the flat multiple. The dashboard's method section prints the fitted
values and the full category table.

## Robustness

Out-of-sample split-half validation (splitting by slug parity, fitting on one half and
scoring the other, in both directions) gives median |log error| of 1.25 / 1.28 for the
model against 1.54 / 1.70 for the flat baseline, so the model still beats the baseline
out of sample rather than merely overfitting its calibration set. Under parameter
perturbations — shrinkage, growth clamping, maturity floor, size reference and grid
step all varied — the model's error stays in 0.99–1.14 (baseline 1.63) and the top 10
overlap is at least 9/10 in every variant. Removing rain, the most extreme calibration
member at 400x market-cap/TVL, and refitting leaves the board's #1 (wbtc) unchanged.

## Run it

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

Outputs: `board.json` (the ranked board), `data.js` (the dashboard's data), `dashboard/`
(the static page), `screenshots/`, and `dossier.json`. The gate caps each output at
`board.json` ≤ 8 MiB, `dossier.json` ≤ 1.5 MiB, and `screenshots/` at 3–4 images of
≤ 512 KiB each.

## Layout

- `main.ts` — entry point: fit, rank, write, copy, dossier.
- `lib/model.ts` — snapshot parsing, the fitting procedure, the board, the farm plans.
- `lib/chains.ts` — chain cost tiers the farm plans quote.
- `vendor/makefun-board.ts` — the competition's dossier library, vendored unchanged.
- `dashboard/` — the static page: sortable, filterable, with a detail view per protocol.
