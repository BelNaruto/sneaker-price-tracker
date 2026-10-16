/* Sneaker Price Tracker — vanilla JS, no build step.
 * Data: KicksCrew Sneakers Data API (https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/kickscrew-sneakers-data)
 * Support (fastest): Telegram @pintoflow
 */
const HOST = 'kickscrew-sneakers-data.p.rapidapi.com';
const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const money = (n) => '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const skuOf = (title) => (title.match(/[A-Z0-9]{5,7}-[0-9]{3}$/) || [''])[0];

let settings = store.get('spt.settings', { apiKey: '', proxyUrl: '' });
let watch = store.get('spt.watch', {});
let demo = null;
let current = null;
let sizeChart, historyChart;

const mode = () => (settings.proxyUrl ? 'proxy' : settings.apiKey ? 'live' : 'demo');

/* ---------- API ---------- */
async function api(path, params) {
  const qs = new URLSearchParams(params).toString();
  if (mode() === 'proxy') return (await fetch(`${settings.proxyUrl.replace(/\/$/, '')}${path}?${qs}`)).json();
  const res = await fetch(`https://${HOST}${path}?${qs}`, {
    headers: { 'x-rapidapi-key': settings.apiKey, 'x-rapidapi-host': HOST },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// Normalise /search/v2 products
const fromSearch = (p) => ({
  id: p.id, title: p.title, vendor: p.vendor, handle: p.handle, url: p.url,
  image: p.image_url || p.images?.[0]?.url, images: (p.images || []).map((i) => i.url), sizes: null,
});

// Normalise /product/description(/byslugs) -> [gender, usSize, price, inStock]
const sizesFromDetails = (d) =>
  (d?.variants?.edges || []).map(({ node }) => {
    const label = node.selectedOptions.find((o) => o.name === 'Size')?.value || node.title;
    const us = (label.match(/US\s*([\d.]+[YCK]?)/) || [, label])[1];
    return [node.selectedOptions.find((o) => o.name === 'Gender')?.value || '', us, Number(node.price.amount), node.availableForSale ? 1 : 0];
  }).filter((s) => s[2] > 0);

async function search(query) {
  if (mode() === 'demo') {
    demo ||= await (await fetch('data/demo.json')).json();
    return demo.products;
  }
  const r = await api('/search/v2', { query, hitsPerPage: 16, page: 1, region: 'US', currency: 'USD' });
  return r.data.products.map(fromSearch);
}

async function loadSizes(p) {
  if (p.sizes) return p;
  const r = await api('/product/description/byslugs', { handle: p.handle, country: 'US' });
  p.sizes = sizesFromDetails(r.data);
  p.images = (r.data.images?.edges || []).map((e) => e.node.url);
  return p;
}

/* ---------- helpers ---------- */
const inStock = (p) => (p.sizes || []).filter((s) => s[3]);
const cheapest = (p) => inStock(p).sort((a, b) => a[2] - b[2])[0];
const mine = (p) => {
  const s = $('#size').value.trim();
  return s && inStock(p).find((x) => x[1] === s);
};

/* ---------- results ---------- */
async function runSearch(e) {
  e?.preventDefault();
  const q = $('#q').value.trim();
  $('#grid').innerHTML = '<p class="muted">Loading…</p>';
  try {
    const products = await search(q);
    renderGrid(products);
    // Lazy-load sizes (4 at a time) so cards show the "from" price
    const queue = products.filter((p) => !p.sizes);
    const worker = async () => { while (queue.length) { const p = queue.shift(); try { await loadSizes(p); renderGrid(products); } catch {} } };
    await Promise.all([worker(), worker(), worker(), worker()]);
  } catch (err) {
    $('#grid').innerHTML = `<p>⚠️ ${err.message}</p>`;
  }
}

function renderGrid(products) {
  const priced = products.filter((p) => cheapest(p));
  const all = priced.map((p) => cheapest(p)[2]);
  $('#stats').innerHTML = `
    <div class="stat"><b>${products.length}</b><span>sneakers found</span></div>
    <div class="stat"><b>${all.length ? money(Math.min(...all)) : '—'}</b><span>cheapest pair</span></div>
    <div class="stat"><b>${all.length ? money(all.reduce((a, b) => a + b, 0) / all.length) : '—'}</b><span>average "from" price</span></div>
    <div class="stat"><b>${priced.reduce((n, p) => n + inStock(p).length, 0)}</b><span>sizes in stock</span></div>`;
  const best = all.length ? Math.min(...all) : null;
  $('#grid').innerHTML = products.map((p, i) => {
    const c = cheapest(p), m = mine(p);
    return `<article class="card" data-i="${i}">
      ${c && c[2] === best ? '<span class="badge">Best price</span>' : ''}
      <div class="img"><img loading="lazy" src="${p.image}" alt="${p.title}"></div>
      <div class="body"><div class="v">${p.vendor} · ${skuOf(p.title)}</div>
        <div class="t">${p.title}</div>
        <div class="p">${c ? `<span class="from">${money(m ? m[2] : c[2])}</span><span class="muted">${m ? 'your size US ' + m[1] : 'from · ' + inStock(p).length + ' sizes'}</span>` : '<span class="muted">loading sizes…</span>'}</div>
      </div></article>`;
  }).join('');
  document.querySelectorAll('.card').forEach((el) => (el.onclick = () => openProduct(products[el.dataset.i])));
}

/* ---------- product modal ---------- */
async function openProduct(p) {
  current = await loadSizes(p);
  $('#modal').classList.remove('hidden');
  $('#mImg').src = p.images?.[0] || p.image;
  $('#mThumbs').innerHTML = (p.images || []).slice(0, 5).map((u) => `<img src="${u}">`).join('');
  document.querySelectorAll('#mThumbs img').forEach((t) => (t.onclick = () => ($('#mImg').src = t.src)));
  $('#mVendor').textContent = `${p.vendor} · ${skuOf(p.title)}`;
  $('#mTitle').textContent = p.title;
  $('#mLink').href = p.url;
  const c = cheapest(p), prices = inStock(p).map((s) => s[2]);
  $('#mKpis').innerHTML = `
    <div class="kpi"><b>${c ? money(c[2]) : '—'}</b><span>cheapest (US ${c ? c[1] : '–'})</span></div>
    <div class="kpi"><b>${prices.length ? money(prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)]) : '—'}</b><span>median price</span></div>
    <div class="kpi"><b>${inStock(p).length}/${p.sizes.length}</b><span>sizes in stock</span></div>`;
  $('#trackBtn').textContent = watch[p.handle] ? '✓ Tracking' : '⭐ Track price';

  const my = $('#size').value.trim();
  $('#sizeTable').innerHTML = p.sizes.map((s) => `<div class="sz ${s[3] ? 'in' : 'out'} ${c && s === c ? 'best' : ''} ${s[1] === my ? 'mine' : ''}"><span>US ${s[1]}</span><b>${money(s[2])}</b></div>`).join('');

  sizeChart?.destroy();
  const cap = prices.length ? Math.ceil((prices[Math.floor(prices.length * 0.9)] * 1.4) / 100) * 100 : undefined;
  sizeChart = new Chart($('#sizeChart'), {
    type: 'bar',
    data: { labels: p.sizes.map((s) => s[1]), datasets: [{ data: p.sizes.map((s) => s[2]), backgroundColor: p.sizes.map((s) => (s === c ? '#ff5a1f' : s[3] ? '#22c55e' : '#475066')), borderRadius: 6 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => money(x.raw) } } },
      scales: { y: { max: cap, ticks: { color: '#8a93a6', callback: (v) => '$' + v }, grid: { color: '#222838' } }, x: { ticks: { color: '#8a93a6' }, grid: { display: false }, title: { display: true, text: 'US size', color: '#8a93a6' } } } },
  });
}

/* ---------- watchlist ---------- */
function snapshotOf(p) {
  const c = cheapest(p), m = mine(p);
  return { t: Date.now(), min: c ? c[2] : null, mine: m ? m[2] : null };
}
function track() {
  const p = current;
  if (watch[p.handle]) delete watch[p.handle];
  else watch[p.handle] = { title: p.title, image: p.image, url: p.url, size: $('#size').value.trim(), history: [snapshotOf(p)] };
  store.set('spt.watch', watch);
  $('#trackBtn').textContent = watch[p.handle] ? '✓ Tracking' : '⭐ Track price';
  renderWatch();
}
async function refreshAll() {
  for (const [handle, w] of Object.entries(watch)) {
    const p = await loadSizes({ handle, sizes: mode() === 'demo' ? (demo.products.find((x) => x.handle === handle) || {}).sizes : null });
    w.history.push(snapshotOf(p));
  }
  store.set('spt.watch', watch);
  renderWatch();
}
function renderWatch() {
  const items = Object.entries(watch);
  $('#wlCount').textContent = items.length;
  $('#wlList').innerHTML = items.map(([h, w]) => {
    const first = w.history[0].min, last = w.history.at(-1).min, diff = last - first;
    return `<div class="wl-item"><img src="${w.image}"><div class="grow"><b>${w.title}</b><div class="muted">${w.history.length} snapshots · first ${money(first)}</div></div>
      <div><b>${money(last)}</b><div class="${diff <= 0 ? 'down' : 'up'}">${diff <= 0 ? '▼' : '▲'} ${money(Math.abs(diff))}</div></div><a href="${w.url}" target="_blank">↗</a></div>`;
  }).join('') || '<p class="muted">Open a sneaker and click “Track price”.</p>';
  historyChart?.destroy();
  const palette = ['#ff5a1f', '#22c55e', '#7cb7ff', '#eab308', '#c084fc'];
  historyChart = new Chart($('#historyChart'), {
    type: 'line',
    data: { datasets: items.map(([h, w], i) => ({ label: w.title.replace(/ [A-Z0-9-]+$/, ''), data: w.history.map((s) => ({ x: s.t, y: s.min })), borderColor: palette[i % 5], backgroundColor: palette[i % 5], tension: 0.3, pointRadius: 2 })) },
    options: { parsing: false, plugins: { legend: { labels: { color: '#e8ecf3' } } },
      scales: { x: { type: 'linear', ticks: { color: '#8a93a6', callback: (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }, grid: { color: '#222838' } },
        y: { ticks: { color: '#8a93a6', callback: (v) => '$' + v }, grid: { color: '#222838' } } } },
  });
}

// Demo mode only: seed a watchlist with SIMULATED 30-day history around today's real prices
function seedDemoWatch() {
  if (Object.keys(watch).length || !demo) return;
  const day = 864e5, now = Date.now();
  demo.products.slice(0, 3).forEach((p, k) => {
    const real = cheapest(p)[2];
    let v = real * (1.18 + k * 0.05);
    const history = Array.from({ length: 30 }, (_, i) => { v = i === 29 ? real : Math.max(real, v * (0.985 + Math.sin(i + k) * 0.01)); return { t: now - (29 - i) * day, min: +v.toFixed(2) }; });
    watch[p.handle] = { title: p.title, image: p.image, url: p.url, size: '', history, simulated: true };
  });
}

/* ---------- UI wiring ---------- */
document.querySelectorAll('.tab').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('hidden', v.id !== b.dataset.view));
  if (b.dataset.view === 'watchlist') renderWatch();
}));
$('#searchForm').onsubmit = runSearch;
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$('#trackBtn').onclick = track;
$('#refreshAll').onclick = refreshAll;
$('#settingsBtn').onclick = () => { $('#apiKey').value = settings.apiKey; $('#proxyUrl').value = settings.proxyUrl; $('#settings').classList.remove('hidden'); };
document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('#' + b.dataset.close).classList.add('hidden')));
$('#saveSettings').onclick = () => { settings = { apiKey: $('#apiKey').value.trim(), proxyUrl: $('#proxyUrl').value.trim() }; store.set('spt.settings', settings); location.reload(); };

(async () => {
  if (mode() === 'demo') {
    $('#banner').classList.add('show');
    $('#banner').innerHTML = '🧪 <b>Demo mode</b> — real KicksCrew data snapshot (searched "jordan 1"). Add your <a href="https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/kickscrew-sneakers-data" target="_blank">RapidAPI key</a> in ⚙️ to search live. Watchlist history is simulated in demo mode.';
  }
  await runSearch();
  if (mode() === 'demo') { seedDemoWatch(); renderWatch(); }
  $('#wlCount').textContent = Object.keys(watch).length;
})();
