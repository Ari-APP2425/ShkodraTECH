// shkodra-products.js
// Lidh aplikacionin e faturave/preventivave me produktet e shkodratech.al (Firestore, vetëm lexim).
// Ngarkoje në index.html PAS app.js:  <script src="shkodra-products.js"></script>
(function () {
  const PROJECT_ID = 'shkodratech-ec8c0';
  const COLLECTION = 'products';
  const SITE_CURRENCY = 'ALL';          // monedha e çmimeve në shkodratech.al: 'ALL' ose 'EUR'
  const CACHE_KEY = 'shkodra_products_cache_v1';
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
    s = s.replace(/,(?=\d{3}(\D|$))/g, '');   // 12,500 -> 12500
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function normalize(p) {
    return {
      id: p.id,
      name: String(pick(p, ['name', 'title', 'emri', 'emertimi', 'productName'])).trim(),
      price: toNum(pick(p, ['price', 'cmimi', 'çmimi', 'salePrice'])),
      category: String(pick(p, ['category', 'kategoria', 'cat'])).trim(),
      currency: String(pick(p, ['currency', 'monedha']) || SITE_CURRENCY).toUpperCase(),
      hidden: p.hidden === true || p.active === false || p.visible === false
    };
  }

  // ── Datalist me produktet ─────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }
  function renderList() {
    let dl = document.getElementById('shkodraProducts');
    if (!dl) {
      dl = document.createElement('datalist');
      dl.id = 'shkodraProducts';
      document.body.appendChild(dl);
    }
    dl.innerHTML = PRODUCTS.map(p => {
      const label = (p.category ? p.category + ' · ' : '') + p.price + ' ' + p.currency;
      return '<option value="' + esc(p.name) + '" label="' + esc(label) + '"></option>';
    }).join('');
    setStatus(PRODUCTS.length + ' produkte nga shkodratech.al', false);
  }
  function setStatus(msg, isError) {
    let el = document.getElementById('shkodraStatus');
    if (!el) {
      const body = document.getElementById('itemsBody');
      if (!body) return;
      el = document.createElement('div');
      el.id = 'shkodraStatus';
      el.className = 'small mb-2';
      body.parentNode.insertBefore(el, body);
    }
    el.className = 'small mb-2 ' + (isError ? 'text-danger' : 'text-muted');
    el.textContent = (isError ? '⚠ ' : '🛒 ') + msg;
  }

  // ── Çmimi sipas monedhës së dokumentit ────────────────────────────────
  function priceFor(p) {
    const to = document.getElementById('monedha').value;       // ALL / EUR / USD
    let v = p.price;
    if (p.currency === 'ALL' && to === 'EUR') v = p.price / exchangeRate;
    else if (p.currency === 'EUR' && to === 'ALL') v = p.price * exchangeRate;
    return Math.round(v * 100) / 100;
  }

  // ── Zgjedhja e produktit në rresht ────────────────────────────────────
  function applyProduct(id, input) {
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    const p = PRODUCTS.find(x => x.name.toLowerCase() === q);
    if (!p) return;                                            // tekst i lirë, mos prek rreshtin
    const desc = document.getElementById('desc-' + id);
    const price = document.getElementById('price-' + id);
    const unit = document.getElementById('unit-' + id);
    if (desc) desc.value = p.name;
    if (price) price.value = priceFor(p);
    if (unit && !unit.value) unit.value = 'copë';
    calcRowTotal(id);
    calcTotals();
    input.value = '';
  }
  function injectPicker(id) {
    const desc = document.getElementById('desc-' + id);
    if (!desc || document.getElementById('prod-' + id)) return;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'prod-' + id;
    inp.className = 'form-control form-control-sm mb-2';
    inp.setAttribute('list', 'shkodraProducts');
    inp.setAttribute('autocomplete', 'off');
    inp.placeholder = '🔍 Kërko produkt nga shkodratech.al...';
    inp.addEventListener('change', () => applyProduct(id, inp));
    desc.parentNode.insertBefore(inp, desc);
  }

  // Çdo rresht i ri merr kërkuesin e produkteve
  const _addRow = window.addRow;
  window.addRow = function () {
    const r = _addRow.apply(this, arguments);
    injectPicker(rowCounter);
    return r;
  };

  // ── Nisja ─────────────────────────────────────────────────────────────
  async function init() {
    document.querySelectorAll('#itemsBody .item-row').forEach(row => injectPicker(row.id.replace('row-', '')));
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (c.length) { PRODUCTS = c; renderList(); }
    } catch (e) {}
    try {
      const list = (await fetchAll()).map(normalize).filter(p => p.name && !p.hidden);
      if (!list.length) throw new Error('asnjë produkt me emër (kontrollo emrat e fushave)');
      PRODUCTS = list.sort((a, b) => a.name.localeCompare(b.name));
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(PRODUCTS)); } catch (e) {}
      renderList();
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
