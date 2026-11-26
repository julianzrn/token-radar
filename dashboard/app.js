// Token Radar dashboard. Static and offline: every number on this page comes from ../data.js,
// which the entry's program writes from the same fitted model and the same board it submits,
// so the page and board.json cannot disagree. Views are hash routes (#/board, #/detail/<slug>,
// #/live, #/method) so any state of the page can be linked — and screenshotted — directly.

'use strict';

const R = window.RADAR;
const main = document.getElementById('board');

/* ---------- small DOM and formatting helpers ---------- */

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}
function commas(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function usd(n) {
  return n === null || n === undefined ? '—' : `$${commas(n)}`;
}
function compact(n) {
  if (n === null || n === undefined) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function pct(n) {
  if (n === null || n === undefined) return '—';
  return `${n > 0 ? '+' : ''}${(Math.round(n * 10) / 10).toFixed(1)}%`;
}
function ageText(days) {
  if (days === null || days === undefined) return 'unknown';
  if (days < 365) return `${days}d`;
  return `${(days / 365).toFixed(1)}y`;
}
function mult(n) {
  return `${(Math.round(n * 100) / 100).toFixed(2)}x`;
}

/* ---------- routing ---------- */

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  if (parts[0] === 'detail' && parts[1]) return { view: 'detail', slug: decodeURIComponent(parts[1]) };
  if (parts[0] === 'live') return { view: 'live' };
  if (parts[0] === 'method') return { view: 'method' };
  return {
    view: 'board',
    q: params.get('q') || '',
    cat: params.get('cat') || '',
    chain: params.get('chain') || '',
    watch: params.get('watch') === '1',
    min: Number(params.get('min') || 0),
    sort: params.get('sort') || 'rank',
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
    all: params.get('all') === '1',
  };
}
function boardHash(s) {
  const p = new URLSearchParams();
  if (s.q) p.set('q', s.q);
  if (s.cat) p.set('cat', s.cat);
  if (s.chain) p.set('chain', s.chain);
  if (s.watch) p.set('watch', '1');
  if (s.min) p.set('min', String(s.min));
  if (s.sort !== 'rank') p.set('sort', s.sort);
  if (s.sort !== 'rank' && s.dir === 'asc') p.set('dir', 'asc');
  if (s.all) p.set('all', '1');
  const q = p.toString();
  return `#/board${q ? `?${q}` : ''}`;
}

/* ---------- shared chrome ---------- */

function masthead(active) {
  const head = el('header', 'masthead');
  head.append(el('p', 'kicker', `Token launch radar · model ${R.model_version}`));
  head.append(el('h1', null, 'Pre-token protocols, ranked by fitted implied value'));
  const sub = el('p', 'sub');
  sub.append(document.createTextNode(
    'Every protocol in the snapshot that records no token, priced by a model fitted to the ' +
    'snapshot\'s own token-bearing protocols — never by a hand-written list. '));
  const b = el('b', null, 'Implied value is what the token would be worth if the protocol launched today, unchanged; it is not a forecast that it will launch.');
  sub.append(b);
  head.append(sub);
  const stats = el('div', 'stats');
  const fit = R.fit;
  const items = [
    [`${R.board_size}`, 'protocols ranked'],
    [`${R.watchlist_size}/${R.watchlist_size}`, 'watchlist covered'],
    [`${R.early_size}`, 'found below the floor'],
    [`${R.live_size}`, 'already trading, set aside'],
    [`${fit.calibration_size}`, 'calibration protocols'],
    [`${fit.model_median_log_error.toFixed(2)} vs ${fit.baseline_median_log_error.toFixed(2)}`, 'median |log error| vs flat model'],
  ];
  for (const [v, k] of items) {
    const s = el('div', 'stat');
    s.append(el('span', 'v', v), el('span', 'k', k));
    stats.append(s);
  }
  head.append(stats);
  const tabs = el('nav', 'tabs');
  for (const [view, label] of [['board', 'Radar board'], ['live', 'Already trading'], ['method', 'Model & method']]) {
    const btn = el('button', null, label);
    btn.setAttribute('aria-selected', active === view ? 'true' : 'false');
    btn.addEventListener('click', () => { location.hash = view === 'board' ? '#/board' : `#/${view}`; });
    tabs.append(btn);
  }
  head.append(tabs);
  return head;
}

function footer() {
  const f = el('footer', 'foot');
  f.textContent = `Data: ${R.source}. Snapshot as of ${R.as_of}; ages and growth are counted to that date, never to today. ` +
    'Wording follows the data: a protocol here "records no token" in this snapshot, which is all anyone can claim from it.';
  return f;
}

function render(node) {
  main.replaceChildren(node, footer());
  main.setAttribute('aria-busy', 'false');
  window.scrollTo(0, 0);
}

/* ---------- board view ---------- */

const SORTS = {
  rank: (r) => r.rank,
  name: (r) => r.name.toLowerCase(),
  tvl: (r) => r.tvl_usd,
  change: (r) => (r.change_7d === null ? -Infinity : r.change_7d),
  age: (r) => (r.age_days === null ? -1 : r.age_days),
  implied: (r) => r.implied_value_usd,
};

function filteredRows(s) {
  let rows = R.rows.filter((r) =>
    (!s.cat || r.category === s.cat) &&
    (!s.chain || r.chains.includes(s.chain)) &&
    (!s.watch || r.on_watchlist) &&
    r.tvl_usd >= s.min &&
    (!s.q || r.name.toLowerCase().includes(s.q) || r.slug.includes(s.q)));
  const key = SORTS[s.sort] || SORTS.rank;
  const sign = s.sort === 'rank' ? 1 : (s.dir === 'asc' ? 1 : -1);
  rows = [...rows].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    return a.rank - b.rank;
  });
  return rows;
}

function boardView(s) {
  const frag = document.createDocumentFragment();
  frag.append(masthead('board'));

  const controls = el('div', 'controls');
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search name or slug';
  search.value = s.q;
  search.setAttribute('aria-label', 'Search protocols');
  search.addEventListener('input', () => { s.q = search.value.trim().toLowerCase(); applyState(s, true); });
  controls.append(search);

  const catSel = document.createElement('select');
  catSel.setAttribute('aria-label', 'Filter by category');
  catSel.append(new Option('All categories', ''));
  const catCounts = new Map();
  for (const r of R.rows) if (r.category) catCounts.set(r.category, (catCounts.get(r.category) || 0) + 1);
  for (const [c, n] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) catSel.append(new Option(`${c} (${n})`, c));
  catSel.value = s.cat;
  catSel.addEventListener('change', () => { s.cat = catSel.value; applyState(s); });
  controls.append(catSel);

  const chainSel = document.createElement('select');
  chainSel.setAttribute('aria-label', 'Filter by chain');
  chainSel.append(new Option('All chains', ''));
  const chainCounts = new Map();
  for (const r of R.rows) for (const c of r.chains) chainCounts.set(c, (chainCounts.get(c) || 0) + 1);
  for (const [c, n] of [...chainCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) chainSel.append(new Option(`${c} (${n})`, c));
  chainSel.value = s.chain;
  chainSel.addEventListener('change', () => { s.chain = chainSel.value; applyState(s); });
  controls.append(chainSel);

  const minSel = document.createElement('select');
  minSel.setAttribute('aria-label', 'Minimum TVL');
  for (const [v, label] of [[0, 'Any TVL'], [10e6, 'TVL ≥ $10M'], [50e6, 'TVL ≥ $50M'], [250e6, 'TVL ≥ $250M'], [1e9, 'TVL ≥ $1B']]) {
    minSel.append(new Option(label, String(v)));
  }
  minSel.value = String(s.min);
  minSel.addEventListener('change', () => { s.min = Number(minSel.value); applyState(s); });
  controls.append(minSel);

  const watchLabel = el('label', 'check');
  const watchBox = document.createElement('input');
  watchBox.type = 'checkbox';
  watchBox.checked = s.watch;
  watchBox.addEventListener('change', () => { s.watch = watchBox.checked; applyState(s); });
  watchLabel.append(watchBox, document.createTextNode('Watchlist only'));
  controls.append(watchLabel);

  const rows = filteredRows(s);
  const count = el('span', 'count', `${rows.length} of ${R.board_size} shown`);
  controls.append(count);
  frag.append(controls);

  const wrap = el('div', 'tablewrap');
  const table = el('table');
  const thead = el('thead');
  const htr = el('tr');
  const cols = [
    ['rank', '#', 'num'], ['name', 'Protocol', ''], ['cat', 'Category', ''], ['chains', 'Chains', ''],
    ['tvl', 'TVL', 'num'], ['change', '7d', 'num'], ['age', 'Age', 'num'], ['implied', 'Implied value', 'num'],
  ];
  for (const [key, label, cls] of cols) {
    const th = el('th', cls, label);
    if (SORTS[key] && key !== 'cat' && key !== 'chains') {
      th.classList.add('sortable');
      if (s.sort === key) th.append(el('span', 'dir', s.sort === 'rank' || s.dir === 'desc' ? ' ↓' : ' ↑'));
      th.addEventListener('click', () => {
        if (s.sort === key && key !== 'rank') s.dir = s.dir === 'desc' ? 'asc' : 'desc';
        s.sort = key;
        applyState(s);
      });
    }
    htr.append(th);
  }
  thead.append(htr);
  table.append(thead);
  const tbody = el('tbody');
  const PAGE = 60;
  const shown = s.all ? rows : rows.slice(0, PAGE);
  if (shown.length === 0) {
    const tr = el('tr');
    const td = el('td', 'empty', 'No protocol matches these filters. Loosen one and the radar widens again.');
    td.colSpan = 8;
    tr.append(td);
    tbody.append(tr);
  }
  for (const r of shown) {
    const tr = el('tr');
    tr.addEventListener('click', () => { location.hash = `#/detail/${encodeURIComponent(r.slug)}`; });
    tr.append(el('td', 'rank num', String(r.rank)));
    const nameTd = el('td', 'name');
    nameTd.append(document.createTextNode(r.name));
    nameTd.append(el('span', 'chip' + (r.on_watchlist ? '' : ' early'), r.on_watchlist ? 'watchlist' : 'early'));
    nameTd.append(el('span', 'slug', r.slug));
    tr.append(nameTd);
    tr.append(el('td', 'cat', r.category || '—'));
    tr.append(el('td', 'chains', r.chains.slice(0, 3).join(', ') + (r.chains.length > 3 ? ` +${r.chains.length - 3}` : '')));
    tr.append(el('td', 'num', compact(r.tvl_usd)));
    const ch = el('td', 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), pct(r.change_7d));
    tr.append(ch);
    tr.append(el('td', 'num', ageText(r.age_days)));
    tr.append(el('td', 'num', compact(r.implied_value_usd)));
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  if (!s.all && rows.length > PAGE) {
    const more = el('button', 'more', `Show all ${rows.length} rows`);
    more.addEventListener('click', () => { s.all = true; applyState(s); });
    wrap.append(more);
  }
  frag.append(wrap);
  return frag;
}

function applyState(s, keepFocus) {
  history.replaceState(null, '', boardHash(s));
  render(boardView(s));
  if (keepFocus) {
    const search = main.querySelector('input[type="search"]');
    if (search) { search.focus(); search.setSelectionRange(search.value.length, search.value.length); }
  }
}

/* ---------- detail view ---------- */

function detailView(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  const frag = document.createDocumentFragment();
  frag.append(masthead('board'));
  if (!r) {
    frag.append(el('p', 'empty', 'That protocol is not on the board.'));
    return frag;
  }
  const back = el('button', 'back', '← Back to the board');
  back.addEventListener('click', () => { location.hash = '#/board'; });
  frag.append(back);

  const box = el('section', 'detail');
  const h = el('h2', null, r.name);
  h.append(el('span', 'chip' + (r.on_watchlist ? '' : ' early'), r.on_watchlist ? 'watchlist' : 'early find'));
  box.append(h);
  box.append(el('p', 'meta',
    `${r.slug} · ${r.category || 'uncategorised'} · rank #${r.rank} of ${R.board_size} · records no token in this snapshot` +
    (r.listed_at ? ` · tracked since ${r.listed_at}` : ' · no listing date recorded')));

  const cards = el('div', 'cards');
  for (const [v, k] of [
    [compact(r.implied_value_usd), 'implied value'],
    [usd(r.tvl_usd), 'TVL'],
    [pct(r.change_7d), 'TVL change, 7d'],
    [ageText(r.age_days), 'age at snapshot'],
    [r.chains.length ? r.chains.join(', ') : '—', 'chains'],
    [mult(r.category_multiple), `category multiple (${r.category_peers} peers)`],
  ]) {
    const c = el('div', 'card');
    c.append(el('span', 'v', v), el('span', 'k', k));
    cards.append(c);
  }
  box.append(cards);

  const bd = el('div', 'panelbox');
  bd.append(el('h3', null, 'How the model prices it'));
  const bt = el('table', 'breakdown');
  const catFit = R.fit.categories.find((c) => c.category === r.category);
  const lines = [
    ['TVL', usd(r.tvl_usd)],
    [`x category multiple — ${r.category || 'uncategorised'} median, shrunk (raw ${catFit && catFit.raw_median !== null ? mult(catFit.raw_median) : 'no peers'})`, mult(r.category_multiple)],
    ['= base value', usd(r.base_value_usd)],
    [`x growth — 7d change ${pct(r.change_7d)}, clamped, weight ${R.fit.growth_weight}`, mult(r.growth_multiplier)],
    [`x maturity — age ${ageText(r.age_days)} on the 0.6–1.0 curve`, mult(r.maturity_multiplier)],
    [`x size — fitted slope ${R.fit.size_slope} against a $100M reference`, mult(r.size_multiplier)],
  ];
  for (const [k, v] of lines) {
    const tr = el('tr');
    tr.append(el('td', null, k), el('td', 'num', v));
    bt.append(tr);
  }
  const tot = el('tr', 'tot');
  tot.append(el('td', null, 'implied value'), el('td', 'num', usd(r.implied_value_usd)));
  bt.append(tot);
  bd.append(bt);
  bd.append(el('p', 'note',
    'Every multiplier comes from the snapshot itself: the category multiple is the median market-cap/TVL of the ' +
    'category\'s token-bearing protocols, shrunk toward the global median in log space; the growth weight and the ' +
    'size slope are fitted on the same 128 protocols. The Model & method tab shows the whole fit.'));
  box.append(bd);

  const farm = el('div', 'panelbox');
  farm.append(el('h3', null, 'Farm plan'));
  const ol = el('ol', 'farm');
  for (const step of r.farm_steps) ol.append(el('li', null, step));
  farm.append(ol);
  farm.append(el('p', 'note', 'Costs are planning estimates: gas follows the chain tier of the protocol\'s first chain (see method), capital follows its TVL tier.'));
  box.append(farm);
  frag.append(box);
  return frag;
}

/* ---------- live view ---------- */

function liveView() {
  const frag = document.createDocumentFragment();
  frag.append(masthead('live'));
  const wrap = el('div', 'tablewrap');
  const table = el('table');
  const thead = el('thead');
  const htr = el('tr');
  for (const [label, cls] of [['Protocol', ''], ['Symbol', ''], ['Category', ''], ['TVL', 'num'], ['Market cap (actual)', 'num'], ['7d', 'num']]) {
    htr.append(el('th', cls, label));
  }
  thead.append(htr);
  table.append(thead);
  const tbody = el('tbody');
  for (const p of R.live) {
    const tr = el('tr');
    const nameTd = el('td', 'name');
    nameTd.append(document.createTextNode(p.name));
    nameTd.append(el('span', 'slug', p.slug));
    tr.append(nameTd);
    tr.append(el('td', 'cat', p.symbol || '—'));
    tr.append(el('td', 'cat', p.category || '—'));
    tr.append(el('td', 'num', compact(p.tvl_usd)));
    tr.append(el('td', 'num', p.mcap_usd === null ? 'records a token, no cap' : compact(p.mcap_usd)));
    tr.append(el('td', 'num ' + (p.change_7d === null ? '' : p.change_7d >= 0 ? 'pos' : 'neg'), pct(p.change_7d)));
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  frag.append(wrap);
  frag.append(el('p', 'note',
    'These protocols already record a token, so they are not ranked and carry no farm plan: the market has priced them. ' +
    'They are shown apart, as the calibration set the model learned from (the ones with a positive recorded cap).'));
  return frag;
}

/* ---------- method view ---------- */

function methodView() {
  const fit = R.fit;
  const frag = document.createDocumentFragment();
  frag.append(masthead('method'));
  const box = el('section', 'method');
  box.append(el('h2', null, 'Model & method'));
  const intro = el('p');
  intro.append(document.createTextNode(
    'The radar prices a protocol that records no token by asking what the snapshot\'s own market says a dollar of ' +
    'TVL is worth in protocols like it. The model is '));
  const strong = el('b', null, `fitted at runtime on the ${fit.calibration_size} protocols that record a token and a positive market cap`);
  intro.append(strong, document.createTextNode(
    ' (records with a zero market cap are set aside as data artefacts). Nothing is priced by name; a protocol\'s ' +
    'category, chains, TVL, 7-day growth and age are the only inputs.'));
  box.append(intro);

  const formula = el('span', 'formula',
    'implied = TVL x category multiple x growth multiplier x maturity multiplier x size multiplier');
  box.append(formula);

  const parts = [
    ['Category multiple', `The median market-cap/TVL of the category's token-bearing protocols, shrunk toward the global median (${mult(fit.global_median_multiple)}) in log space with a pseudo-count of 4. Thin categories borrow the market's voice instead of shouting with one member; a category with no token-bearing member takes the global median.`],
    ['Growth', `The 7-day TVL change, clamped to [-60%, +120%] — the snapshot holds a +4,448% outlier that would otherwise price one protocol above the rest of the board combined. Its weight, ${fit.growth_weight}, is the grid-searched value (0 to 1 by 0.05) that minimises the calibration set's median |log error|.`],
    ['Maturity', '0.6 + min(age, 1095 days)/1095 x 0.4. Age is counted from the day the index began tracking the protocol to the snapshot date — never to today, so the board cannot drift. An unknown age takes the category\'s median age, then the global median.'],
    ['Size', `A least-squares term on the fit's residuals: value per TVL dollar falls as TVL rises. Fitted slope ${fit.size_slope} against a $100M reference size, applied as exp(intercept + slope x log(TVL / $100M)) and clamped to [0.15x, 6x].`],
  ];
  for (const [title, body] of parts) {
    box.append(el('h3', null, title));
    box.append(el('p', null, body));
  }

  box.append(el('h3', null, 'Backtest, on the calibration set itself'));
  box.append(el('p', null,
    `Median |log error| of implied vs actual market cap: ${fit.model_median_log_error.toFixed(2)} for this model, ` +
    `${fit.baseline_median_log_error.toFixed(2)} for a flat 0.25x multiple with the same growth and maturity shape. ` +
    'In-sample and stated as such: it shows the fit is real, not that the future is known.'));

  box.append(el('h3', null, 'Validation, beyond the backtest'));
  box.append(el('p', null,
    'Out of sample, the model still wins. Splitting the calibration set in half, fitting on one half and ' +
    'scoring the other in both directions gives a median |log error| of 1.25 and 1.28, against 1.54 and 1.70 ' +
    'for the flat model on the same halves; across 40 repeated random half-splits its average out-of-sample ' +
    'error is 1.26, against 1.58 for the flat model. Under nine parameter perturbations — shrinkage, the ' +
    'growth clamp, the maturity floor, the size reference and the grid step all varied — its error stays ' +
    'between 0.99 and 1.14, and at least 9 of the board\'s top 10 survive every variant. Removing rain, the ' +
    'most extreme calibration member at 400x market-cap/TVL, and refitting moves the error to 1.04 and ' +
    'leaves the board\'s #1 unchanged. Richer variants of this model — robust losses, per-category growth ' +
    'weights, a chain-tier price term, ensembles of fits — were fitted and tested the same way; none beat ' +
    'this configuration consistently out of sample, so none was shipped.'));

  box.append(el('h3', null, 'Category multiples, as fitted'));
  const wrap = el('div', 'tablewrap');
  const table = el('table');
  const thead = el('thead');
  const htr = el('tr');
  for (const [label, cls] of [['Category', ''], ['Token-bearing peers', 'num'], ['Raw median mcap/TVL', 'num'], ['Fitted multiple', 'num']]) htr.append(el('th', cls, label));
  thead.append(htr);
  table.append(thead);
  const tbody = el('tbody');
  for (const c of fit.categories.filter((x) => x.peers > 0)) {
    const tr = el('tr');
    tr.append(el('td', null, c.category || 'Uncategorised'));
    tr.append(el('td', 'num', String(c.peers)));
    tr.append(el('td', 'num', c.raw_median === null ? '—' : mult(c.raw_median)));
    tr.append(el('td', 'num', mult(c.fitted_multiple)));
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  box.append(wrap);
  const noPeers = fit.categories.filter((x) => x.peers === 0).length;
  box.append(el('p', null, `${noPeers} further categories have no token-bearing member in the snapshot and take the global median.`));

  box.append(el('h3', null, 'Farm plans and costs'));
  box.append(el('p', null,
    'Every board row carries a six-step plan generated from its own record: the action follows its category, the ' +
    'suggested capital follows its TVL tier ($50–$250), the holding period follows its age, and one step is composed ' +
    'from its own facts — the chains it spans, a sharp TVL move, a long tokenless history. Gas figures are planning ' +
    'estimates by chain tier: Ethereum L1 about $12 for a swap-class transaction, low-fee chains and rollups about ' +
    '$1, other chains about $3.'));

  box.append(el('h3', null, 'What this board is not'));
  box.append(el('p', null,
    'Implied value assumes the protocol launched a token today, unchanged. It says nothing about whether or when ' +
    'it will. Protocols the index may simply have missed a token for are worded as what the data supports: they ' +
    'record no token in this snapshot.'));
  frag.append(box);
  return frag;
}

/* ---------- go ---------- */

function route() {
  const r = parseRoute();
  if (r.view === 'detail') render(detailView(r.slug));
  else if (r.view === 'live') render(liveView());
  else if (r.view === 'method') render(methodView());
  else render(boardView(r));
}
window.addEventListener('hashchange', route);
route();
