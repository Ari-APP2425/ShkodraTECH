// shkodra-products.js (v2)
// Lidh aplikacionin e faturave/preventivave me produktet e shkodratech.al (Firestore, vetëm lexim).
// Ngarkoje në index.html PAS app.js:  <script src="shkodra-products.js"></script>
(function () {
  const PROJECT_ID = 'shkodratech-ec8c0';
  const COLLECTION = 'products';
  const SITE_CURRENCY = 'EUR';          // monedha e çmimeve në shkodratech.al: 'EUR' ose 'ALL'
  const CACHE_KEY = 'shkodra_products_cache_v2';
  const SYM = { ALL: 'L', EUR: '€', USD: '$' };
  const MAX_RESULTS = 80;
  const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
               '/databases/(default)/documents/' + COLLECTION;

  let PRODUCTS = [];

  // ── Firestore REST -> objekt JS ───────────────────────────────────────
  function parseValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return v.doubleValue;
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('nullValue' in v) return null;
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(parseValue);
    if ('mapValue' in v) {
      const o = {};
      const f = v.mapValue.fields || {};
      Object.keys(f).forEach(k => { o[k] = parseValue(f[k]); });
      return o;
    }
    return null;
  }
  function parseDoc(doc) {
    const o = { id: doc.name.split('/').pop() };
    const f = doc.fields || {};
    Object.keys(f).forEach(k => { o[k] = parseValue(f[k]); });
    return o;
  }
  async function fetchAll() {
    let token = '';
    const out = [];
    do {
      const url = BASE + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
      const res = await fetch(url);
      if (!res.ok) throw new Error('Firestore ' + res.status);
      const data = await res.json();
      (data.documents || []).forEach(d => out.push(parseDoc(d)));
      token = data.nextPageToken || '';
    } while (token);
    return out;
  }

  // ── Normalizim (toleron emra të ndryshëm fushash) ─────────────────────
  function pick(o, keys) {
    for (const k of keys) {
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
    }
    return '';
  }
  function toNum(x) {
    if (typeof x === 'number') return x;
    let s = String(x || '').replace(/\s/g, '');
    s = s.replace(/,(?=\d{3}(\D|$))/g, '');
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function normalize(p) {
    const name = String(pick(p, ['name', 'title', 'emri', 'emertimi', 'productName'])).trim();
    const category = String(pick(p, ['category', 'kategoria', 'cat'])).trim();
    return {
      id: p.id,
      name: name,
      category: category,
      price: toNum(pick(p, ['price', 'cmimi', 'çmimi', 'salePrice', 'priceEur', 'price_eur'])),
      currency: String(pick(p, ['currency', 'monedha']) || SITE_CURRENCY).toUpperCase(),
      hidden: p.hidden === true || p.active === false || p.visible === false,
      hay: (name + ' ' + category).toLowerCase()
    };
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function priceText(p) {
    return p.price > 0 ? (p.price + ' ' + (SYM[p.currency] || p.currency)) : 'pa çmim';
  }

  // ── Çmimi sipas monedhës së dokumentit ────────────────────────────────
  function priceFor(p) {
    const to = document.getElementById('monedha').value;       // ALL / EUR / USD
    let v = p.price;
    if (p.currency === 'ALL' && to === 'EUR') v = p.price / exchangeRate;
    else if (p.currency === 'EUR' && to === 'ALL') v = p.price * exchangeRate;
    return Math.round(v * 100) / 100;
  }

  // ── Dritarja e kërkimit (ekran i plotë) ───────────────────────────────
  let modal = null, targetRow = null, matches = [];

  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'shkodraModal';
    modal.style.cssText = 'display:none;position:fixed;top:0;left:0;right:0;bottom:0;z-index:5000;background:#fff;color:#111;';
    modal.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;">' +
        '<div style="display:flex;gap:8px;padding:10px;border-bottom:1px solid #ddd;background:#f8f9fa;">' +
          '<input id="shkodraQ" type="search" placeholder="Kërko produkt (p.sh. hikvision 5mp)..." autocomplete="off" ' +
                 'style="flex:1;min-width:0;padding:10px;font-size:16px;border:1px solid #bbb;border-radius:8px;">' +
          '<button id="shkodraX" type="button" style="padding:0 16px;border:1px solid #bbb;border-radius:8px;background:#fff;font-size:18px;">✕</button>' +
        '</div>' +
        '<div id="shkodraCount" style="padding:6px 12px;font-size:12px;color:#666;"></div>' +
        '<div id="shkodraList" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>' +
      '</div>';
    document.body.appendChild(modal);
    document.getElementById('shkodraQ').addEventListener('input', e => renderResults(e.target.value));
    document.getElementById('shkodraX').addEventListener('click', closeModal);
    document.getElementById('shkodraList').addEventListener('click', e => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      const p = matches[parseInt(el.getAttribute('data-i'), 10)];
      if (p && targetRow !== null) applyProduct(targetRow, p);
      closeModal();
    });
  }
  function renderResults(q) {
    const list = document.getElementById('shkodraList');
    const count = document.getElementById('shkodraCount');
    if (!PRODUCTS.length) {
      matches = [];
      list.innerHTML = '<div style="padding:16px;color:#666;">Produktet po ngarkohen...</div>';
      count.textContent = '';
      return;
    }
    const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = PRODUCTS.filter(p => words.every(w => p.hay.indexOf(w) !== -1));
    matches = all.slice(0, MAX_RESULTS);
    count.textContent = all.length > MAX_RESULTS
      ? 'Po shfaqen ' + MAX_RESULTS + ' nga ' + all.length + ' — shkruaj më shumë për ta ngushtuar'
      : all.length + ' produkte';
    list.innerHTML = matches.length ? matches.map((p, i) =>
      '<div data-i="' + i + '" style="padding:10px 12px;border-bottom:1px solid #eee;">' +
        '<div style="font-weight:600;font-size:15px;">' + esc(p.name) + '</div>' +
        '<div style="font-size:13px;color:#666;">' + esc(p.category) + (p.category ? ' · ' : '') + esc(priceText(p)) + '</div>' +
      '</div>').join('')
      : '<div style="padding:16px;color:#666;">Asnjë produkt nuk përputhet.</div>';
  }
  function openModal(rowId) {
    buildModal();
    targetRow = rowId;
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    const q = document.getElementById('shkodraQ');
    q.value = '';
    renderResults('');
    setTimeout(() => q.focus(), 50);
  }
  function closeModal() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    targetRow = null;
  }

  // ── Zgjedhja e produktit në rresht ────────────────────────────────────
  function applyProduct(id, p) {
    const desc = document.getElementById('desc-' + id);
    const price = document.getElementById('price-' + id);
    const unit = document.getElementById('unit-' + id);
    if (desc) desc.value = p.name;
    if (price) price.value = priceFor(p);
    if (unit && !unit.value) unit.value = 'copë';
    calcRowTotal(id);
    calcTotals();
  }
  function injectPicker(id) {
    const desc = document.getElementById('desc-' + id);
    if (!desc || document.getElementById('prod-' + id)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'prod-' + id;
    btn.className = 'btn btn-outline-primary btn-sm w-100 mb-2 text-start';
    btn.textContent = '🔍 Kërko produkt nga shkodratech.al';
    btn.addEventListener('click', () => openModal(id));
    desc.parentNode.insertBefore(btn, desc);
  }

  // Çdo rresht i ri merr butonin e kërkimit
  const _addRow = window.addRow;
  window.addRow = function () {
    const r = _addRow.apply(this, arguments);
    injectPicker(rowCounter);
    return r;
  };

  // ── Statusi ───────────────────────────────────────────────────────────
  function setStatus(msg, isError) {
    let el = document.getElementById('shkodraStatus');
    if (!el) {
      const body = document.getElementById('itemsBody');
      if (!body) return;
      el = document.createElement('div');
      el.id = 'shkodraStatus';
      body.parentNode.insertBefore(el, body);
    }
    el.className = 'small mb-2 ' + (isError ? 'text-danger' : 'text-muted');
    el.textContent = (isError ? '⚠ ' : '🛒 ') + msg;
  }

  // ── Nisja ─────────────────────────────────────────────────────────────
  async function init() {
    document.querySelectorAll('#itemsBody .item-row').forEach(row => injectPicker(row.id.replace('row-', '')));
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (c.length) { PRODUCTS = c; setStatus(PRODUCTS.length + ' produkte nga shkodratech.al', false); }
    } catch (e) {}
    try {
      const list = (await fetchAll()).map(normalize).filter(p => p.name && !p.hidden);
      if (!list.length) throw new Error('asnjë produkt me emër (kontrollo emrat e fushave)');
      PRODUCTS = list.sort((a, b) => a.name.localeCompare(b.name));
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(PRODUCTS)); } catch (e) {}
      setStatus(PRODUCTS.length + ' produkte nga shkodratech.al', false);
      if (modal && modal.style.display === 'block') renderResults(document.getElementById('shkodraQ').value);
    } catch (e) {
      console.error('shkodra-products:', e);
      setStatus(PRODUCTS.length
        ? 'Offline, po përdor ' + PRODUCTS.length + ' produkte të ruajtura'
        : 'Produktet nuk u ngarkuan (' + e.message + ')', !PRODUCTS.length);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
