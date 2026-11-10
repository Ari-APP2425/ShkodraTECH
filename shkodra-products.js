// shkodra-products.js (v3)
// Produktet e shkodratech.al (Firestore, vetëm lexim) brenda aplikacionit të faturave/preventivave.
// Ngarkoje në index.html PAS app.js:  <script src="shkodra-products.js"></script>
//
// Çfarë ka të re në v3:
//  • Buton i vogël rrumbullak poshtë djathtas (🔍) — kur e klikon hapet kërkimi në ekran të plotë.
//  • Kliko produktin => shtohet menjëherë si rresht i ri (ose rritet sasia nëse ekziston). Dritarja mbetet hapur.
//  • Përditësim LIVE: sa herë shtohet/hiqet/ndryshon një produkt në shkodratech.al, lista përditësohet vetë.
//    (përdor Firestore realtime; nëse s'ngarkohet, kalon automatikisht në rifreskim kur hap aplikacionin/dritaren)
(function () {
  const PROJECT_ID = 'shkodratech-ec8c0';
  const COLLECTION = 'products';
  const SITE_CURRENCY = 'EUR';          // monedha e çmimeve në shkodratech.al: 'EUR' ose 'ALL'
  const CACHE_KEY = 'shkodra_products_cache_v2';
  const SYM = { ALL: 'L', EUR: '€', USD: '$' };
  const MAX_RESULTS = 80;
  const FB_VER = '10.12.2';
  const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
               '/databases/(default)/documents/' + COLLECTION;

  let PRODUCTS = [];
  let liveState = 'offline';            // 'live' | 'polling' | 'offline' | 'loading'
  let lastError = '';
  let lastFetch = 0;

  // ── Firestore REST -> objekt JS (fallback) ────────────────────────────
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

  // ── Normalizim ────────────────────────────────────────────────────────
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
  function priceFor(p) {
    const to = document.getElementById('monedha').value;       // ALL / EUR / USD
    let v = p.price;
    if (p.currency === 'ALL' && to === 'EUR') v = p.price / exchangeRate;
    else if (p.currency === 'EUR' && to === 'ALL') v = p.price * exchangeRate;
    return Math.round(v * 100) / 100;
  }

  // ── Marrja e listës (live ose fallback) ───────────────────────────────
  function setProducts(rawList) {
    const list = rawList.map(normalize).filter(p => p.name && !p.hidden);
    list.sort((a, b) => a.name.localeCompare(b.name));
    PRODUCTS = list;
    lastFetch = Date.now();
    lastError = '';
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(PRODUCTS)); } catch (e) {}
    refreshUI();
  }
  function refreshUI() {
    if (modal && modal.style.display === 'block') {
      renderResults(document.getElementById('shkodraQ').value);
    }
    updateFabBadge();
  }

  async function refreshREST(force) {
    if (!force && Date.now() - lastFetch < 60000) return;   // mos e ngarko më shpesh se 1 min
    try {
      const raw = await fetchAll();
      if (!raw.length) throw new Error('asnjë produkt');
      if (liveState !== 'live') liveState = 'polling';
      setProducts(raw);
    } catch (e) {
      console.error('shkodra-products:', e);
      lastError = e.message;
      if (liveState !== 'live') liveState = PRODUCTS.length ? 'offline' : 'offline';
      refreshUI();
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('script ' + src));
      document.head.appendChild(s);
    });
  }
  async function startLive() {
    try {
      await loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-app-compat.js');
      await loadScript('https://www.gstatic.com/firebasejs/' + FB_VER + '/firebase-firestore-compat.js');
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp({ projectId: PROJECT_ID });
      const db = firebase.firestore(app);
      try { db.settings({ experimentalAutoDetectLongPolling: true, merge: true }); } catch (e) {}
      db.collection(COLLECTION).onSnapshot(snap => {
        const raw = [];
        snap.forEach(d => raw.push(Object.assign({ id: d.id }, d.data())));
        if (!raw.length) return;
        liveState = 'live';
        setProducts(raw);
      }, err => {
        console.error('shkodra-products live:', err);
        liveState = 'polling';
        refreshREST(true);
      });
    } catch (e) {
      console.error('shkodra-products: live nuk u nis, përdoret rifreskimi', e);
      liveState = 'polling';
      refreshREST(true);
    }
  }

  // ── Stilet ────────────────────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('shkodraStyle')) return;
    const st = document.createElement('style');
    st.id = 'shkodraStyle';
    st.textContent =
      '#shkodraFab{position:relative;flex:0 0 auto;height:40px;min-width:40px;width:40px;border-radius:20px;border:0;'+
        'background:#1e3a5f;color:#fff;font-size:17px;display:flex;align-items:center;justify-content:center;gap:8px;'+
        'box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;overflow:hidden;white-space:nowrap;padding:0}'+
      '#shkodraFab .lbl{display:none;font-size:14px;font-weight:600}'+
      '#shkodraFab .dot{position:absolute;top:5px;right:5px;width:9px;height:9px;border-radius:50%;border:2px solid #1e3a5f;background:#9ca3af}'+
      '#shkodraFab.live .dot{background:#22c55e}'+
      '#shkodraFab.polling .dot{background:#f59e0b}'+
      '#shkodraFab.wide{flex:1 1 auto;width:auto;padding:0 16px;justify-content:flex-start;animation:shkodraWide .22s ease-out}'+
      '#shkodraFab.wide .lbl{display:inline}'+
      '@keyframes shkodraWide{from{max-width:40px}to{max-width:100%}}'+
      '#shkodraModal{display:none;position:fixed;inset:0;z-index:5000;background:#fff;color:#111;' +
        'transform-origin:50% 100%;}' +
      '#shkodraModal.open{animation:shkodraOpen .25s ease-out}' +
      '@keyframes shkodraOpen{from{transform:scale(.08);opacity:0;border-radius:50%}to{transform:scale(1);opacity:1;border-radius:0}}' +
      '#shkodraList [data-i]{padding:10px 12px;border-bottom:1px solid #eee;display:flex;align-items:center;gap:10px}' +
      '#shkodraList [data-i]:active{background:#eef6ff}' +
      '#shkodraList .plus{flex:0 0 auto;width:30px;height:30px;border-radius:50%;background:#e8f0fe;color:#1e3a5f;' +
        'display:flex;align-items:center;justify-content:center;font-weight:700}' +
      '#shkodraToast{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;' +
        'padding:8px 16px;border-radius:20px;font-size:14px;opacity:0;transition:opacity .2s;pointer-events:none;max-width:90%}' +
      '#shkodraToast.show{opacity:.92}';
    document.head.appendChild(st);
  }

  // ── Lupa e rrumbullakët (në fund të listës së artikujve) ──────────────
  let fab = null, addBtn = null;
  function buildFab() {
    if (fab) return;
    addBtn = document.querySelector('button[onclick="addRow()"]');
    const host = addBtn ? addBtn.parentNode : document.getElementById('itemsBody');
    if (!host) return;
    host.style.display = 'flex';
    host.style.gap = '8px';
    host.style.alignItems = 'center';
    if (addBtn) addBtn.style.flex = '1 1 auto';
    fab = document.createElement('button');
    fab.id = 'shkodraFab';
    fab.type = 'button';
    fab.title = 'Kërko produkt nga shkodratech.al';
    fab.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i><span class="lbl">Kërko produkt nga shkodratech.al</span><span class="dot"></span>';
    fab.addEventListener('click', openModal);
    host.appendChild(fab);
    updateFabBadge();
  }
  function updateFabBadge() {
    if (!fab) return;
    fab.classList.toggle('live', liveState === 'live');
    fab.classList.toggle('polling', liveState === 'polling');
  }
  function setFabWide(wide) {
    if (!fab) return;
    fab.classList.toggle('wide', wide);
    if (addBtn) addBtn.style.display = wide ? 'none' : '';
  }

  // ── Dritarja e kërkimit ───────────────────────────────────────────────
  let modal = null, matches = [], toastTimer = null;

  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'shkodraModal';
    modal.innerHTML =
      '<div style="display:flex;flex-direction:column;height:100%;">' +
        '<div style="display:flex;gap:8px;padding:10px;border-bottom:1px solid #ddd;background:#f8f9fa;">' +
          '<input id="shkodraQ" type="search" placeholder="Kërko produkt (p.sh. hikvision 5mp)..." autocomplete="off" ' +
                 'style="flex:1;min-width:0;padding:10px;font-size:16px;border:1px solid #bbb;border-radius:8px;">' +
          '<button id="shkodraX" type="button" style="padding:0 16px;border:1px solid #bbb;border-radius:8px;background:#fff;font-size:18px;">✕</button>' +
        '</div>' +
        '<div id="shkodraCount" style="padding:6px 12px;font-size:12px;color:#666;"></div>' +
        '<div id="shkodraList" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;"></div>' +
      '</div>' +
      '<div id="shkodraToast"></div>';
    document.body.appendChild(modal);
    document.getElementById('shkodraQ').addEventListener('input', e => renderResults(e.target.value));
    document.getElementById('shkodraX').addEventListener('click', closeModal);
    document.getElementById('shkodraList').addEventListener('click', e => {
      const el = e.target.closest('[data-i]');
      if (!el) return;
      const p = matches[parseInt(el.getAttribute('data-i'), 10)];
      if (p) addProduct(p);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.style.display === 'block') closeModal();
    });
  }
  function statusText() {
    if (liveState === 'live') return '🟢 live';
    if (liveState === 'polling') return '🟠 rifreskim';
    return PRODUCTS.length ? '⚪ offline (të ruajtura)' : '⚠ ' + (lastError || 'pa lidhje');
  }
  function renderResults(q) {
    const list = document.getElementById('shkodraList');
    const count = document.getElementById('shkodraCount');
    if (!PRODUCTS.length) {
      matches = [];
      list.innerHTML = '<div style="padding:16px;color:#666;">' +
        (lastError ? 'Produktet nuk u ngarkuan (' + esc(lastError) + ')' : 'Produktet po ngarkohen...') + '</div>';
      count.textContent = '';
      return;
    }
    const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = PRODUCTS.filter(p => words.every(w => p.hay.indexOf(w) !== -1));
    matches = all.slice(0, MAX_RESULTS);
    count.textContent = (all.length > MAX_RESULTS
      ? 'Po shfaqen ' + MAX_RESULTS + ' nga ' + all.length + ' — shkruaj më shumë'
      : all.length + ' produkte') + '  ·  ' + statusText();
    list.innerHTML = matches.length ? matches.map((p, i) =>
      '<div data-i="' + i + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-weight:600;font-size:15px;">' + esc(p.name) + '</div>' +
          '<div style="font-size:13px;color:#666;">' + esc(p.category) + (p.category ? ' · ' : '') + esc(priceText(p)) + '</div>' +
        '</div>' +
        '<div class="plus">+</div>' +
      '</div>').join('')
      : '<div style="padding:16px;color:#666;">Asnjë produkt nuk përputhet.</div>';
  }
  function openModal() {
    buildModal();
    setFabWide(true);                                   // lupa zgjatet si më parë
    setTimeout(() => {
      if (fab) {
        const r = fab.getBoundingClientRect();
        modal.style.transformOrigin = (r.left + r.width / 2) + 'px ' + (r.top + r.height / 2) + 'px';
      }
      modal.style.display = 'block';
      modal.classList.remove('open'); void modal.offsetWidth; modal.classList.add('open');
      document.body.style.overflow = 'hidden';
      const q = document.getElementById('shkodraQ');
      q.value = '';
      renderResults('');
      setTimeout(() => q.focus(), 280);
    }, 180);
    refreshREST(false);          // siguri shtesë nëse live nuk punon (max 1 herë/min)
  }
  function closeModal() {
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    setFabWide(false);                                  // lupa kthehet e rrumbullakët
  }
  function toast(msg) {
    const t = document.getElementById('shkodraToast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1400);
  }

  // ── Shtimi i produktit në dokument ────────────────────────────────────
  function rowIds() {
    return [...document.querySelectorAll('#itemsBody .item-row')].map(r => r.id.replace('row-', ''));
  }
  function addProduct(p) {
    const price = priceFor(p);
    const ids = rowIds();

    // 1) Nëse produkti është tashmë në listë -> rrit sasinë
    for (const id of ids) {
      const d = document.getElementById('desc-' + id);
      if (d && d.value.trim() === p.name) {
        const q = document.getElementById('qty-' + id);
        q.value = (parseFloat(q.value) || 0) + 1;
        calcRowTotal(id); calcTotals();
        toast('✓ ' + p.name + ' — sasia ' + q.value);
        return;
      }
    }
    // 2) Rresht bosh në fund -> mbushe; përndryshe rresht i ri
    let id = null;
    const last = ids[ids.length - 1];
    if (last) {
      const d = document.getElementById('desc-' + last);
      const pr = document.getElementById('price-' + last);
      if (d && !d.value.trim() && !(parseFloat(pr.value) > 0)) id = last;
    }
    if (id === null) {
      addRow(p.name, 1, 'copë', price, 'Tjeter');
      id = String(rowCounter);
    } else {
      document.getElementById('desc-' + id).value = p.name;
      document.getElementById('price-' + id).value = price;
      const unit = document.getElementById('unit-' + id);
      if (unit && !unit.value) unit.value = 'copë';
      const type = document.getElementById('type-' + id);
      if (type && type.value !== 'Tjeter') { type.value = 'Tjeter'; if (typeof onTypeChange === 'function') onTypeChange(id); document.getElementById('desc-' + id).value = p.name; }
    }
    calcRowTotal(id);
    calcTotals();
    toast('✓ U shtua: ' + p.name);
  }

  // ── Nisja ─────────────────────────────────────────────────────────────
  function init() {
    injectStyle();
    buildFab();
    // Hiq butonat e vjetër për çdo rresht (nga v2), nëse ka mbetur ndonjë
    document.querySelectorAll('[id^="prod-"]').forEach(b => b.remove());
    document.getElementById('shkodraStatus')?.remove();
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (c.length) { PRODUCTS = c; }
    } catch (e) {}
    startLive();
    // Rifreskim kur kthehesh në aplikacion (telefoni)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && liveState !== 'live') refreshREST(false);
    });
    window.addEventListener('online', () => { if (liveState !== 'live') refreshREST(true); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
