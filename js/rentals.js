(function () {
  'use strict';

  if (window.__bhbRentalsInited) return;
  window.__bhbRentalsInited = true;

  // ─── Config ──────────────────────────────────────────────────────────────────
  var GRID_ID    = 'rentals-wrapper';
  var CARD_SEL   = '.w-dyn-item';
  var STEP       = 9;
  var MAPTILER_KEY = 'c43H8q7pFefMtElMtWBS';
  var MAP_STYLE    = '019c8e23-ebd1-7221-bd5f-20ae2dca2ab6';
  var PIN_URL      = 'https://cdn.prod.website-files.com/67344ae68adf4fc1f539002d/69a009335d3c16a421dd917a_Icon.svg';

  var AREA_RULES = [
    { id: 'canggu-area',  label: 'Canggu area',  keys: ['canggu','pererenan','seseh','cemagi','kaba kaba','kaba-kaba','cepaka','tumbak bayuh','buwit','dalung'] },
    { id: 'uluwatu-area', label: 'Uluwatu area', keys: ['bingin','uluwatu','uluwatu center','ungasan'] },
    { id: 'ubud-area',    label: 'Ubud area',    keys: ['ubud','ubud center'] },
    { id: 'tabanan-area', label: 'Tabanan area', keys: ['kedungu','nyanyi','pandak gede','nyambu','tanah lot'] }
  ];

  var LOC_COORDS = {
    'canggu':        [115.13650, -8.65062],
    'pererenan':     [115.12346, -8.64904],
    'seseh':         [115.11505, -8.64560],
    'cemagi':        [115.11502, -8.62971],
    'kaba kaba':     [115.13919, -8.59345],
    'kaba-kaba':     [115.13919, -8.59345],
    'cepaka':        [115.14526, -8.59917],
    'tumbak bayuh':  [115.14562, -8.61484],
    'buwit':         [115.12362, -8.59905],
    'dalung':        [115.17258, -8.61147],
    'bingin':        [115.09200, -8.81200],
    'uluwatu':       [115.08800, -8.82828],
    'uluwatu center':[115.08800, -8.82828],
    'ungasan':       [115.16562, -8.82695],
    'ubud':          [115.26229, -8.50690],
    'ubud center':   [115.26229, -8.50690],
    'kedungu':       [115.09045, -8.60254],
    'nyanyi':        [115.11025, -8.61237],
    'pandak gede':   [115.12800, -8.58500],
    'nyambu':        [115.13200, -8.57800],
    'tanah lot':     [115.12604, -8.58208]
  };

  var CHIP_PRESETS = {
    IDR: [
      { label: '< Rp3B',       min: 0,           max: 3000000000  },
      { label: 'Rp3B–Rp10B',   min: 3000000000,  max: 10000000000 },
      { label: '> Rp10B',      min: 10000000000, max: null        }
    ],
    USD: [
      { label: '< $250k',      min: 0,      max: 250000 },
      { label: '$250k–$600k',  min: 250000, max: 600000 },
      { label: '> $600k',      min: 600000, max: null   }
    ],
    EUR: [
      { label: '< €250k',      min: 0,      max: 250000 },
      { label: '€250k–€600k',  min: 250000, max: 600000 },
      { label: '> €600k',      min: 600000, max: null   }
    ]
  };

  // ─── State ───────────────────────────────────────────────────────────────────
  var allCards = [], filtered = [], visible = 0;
  var map = null, mapReady = false, markers = [];
  var locDropOpen = false, draftLocs = [], areas = [], labelByNorm = {};
  var state = { availability: 'Any', bedrooms: [], locations: [], currency: 'IDR', priceMin: null, priceMax: null, keyword: '' };
  var sliderBase = { min: 0, max: 10000000000 };
  var sliderActive = { min: 0, max: 10000000000 };
  var minRatio = 0, maxRatio = 1;

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function norm(v) {
    return String(v || '').toLowerCase().trim()
      .replace(/[-–—]/g, ' ').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }
  function symFor(c) { return c === 'USD' ? '$' : c === 'EUR' ? '€' : 'Rp'; }
  function short(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n/1e9).toFixed(1).replace('.0','') + 'B';
    if (a >= 1e6) return (n/1e6).toFixed(1).replace('.0','') + 'M';
    if (a >= 1e3) return (n/1e3).toFixed(1).replace('.0','') + 'k';
    return String(Math.round(n));
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fmt(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 }); }

  // ─── DOM refs ─────────────────────────────────────────────────────────────────
  var grid, bedsField, availField, currField;
  var locTrigger, locTrigText, locDropdown;
  var priceTrigger, priceTrigText, priceDropdown;
  var kwInput, btnClear, btnSearch, btnLoadMore, btnBackTop;
  var resultsCount, emptyState;
  var locUI = {};
  var thumbMin, thumbMax, fillEl, trackEl;

  // ─── Cache DOM ────────────────────────────────────────────────────────────────
  function cacheDom() {
    grid        = document.getElementById(GRID_ID);
    locTrigger  = document.querySelector('.location-trigger');
    locTrigText = document.querySelector('.location-trigger_text');
    locDropdown = document.querySelector('.location-dropdown');
    priceTrigger  = document.querySelector('.price-trigger');
    priceTrigText = document.querySelector('.price-trigger_text');
    priceDropdown = document.querySelector('.price-dropdown');
    btnClear    = document.querySelector('.filter-button-1');
    btnSearch   = document.querySelector('.filter-button-2');
    btnLoadMore = document.getElementById('load-more');
    resultsCount = document.getElementById('rental-results-count');
    emptyState   = document.getElementById('rental-empty-state');
    kwInput = document.querySelector('.keyword-input');

    // Detect filter fields by label
    var fields = document.querySelectorAll('.filter-field');
    for (var i = 0; i < fields.length; i++) {
      var lbl = fields[i].querySelector('.filter-label');
      if (!lbl) continue;
      var t = lbl.textContent.toLowerCase().trim();
      if (t.indexOf('bed') > -1)          bedsField = fields[i];
      else if (t.indexOf('avail') > -1)   availField = fields[i];
      else if (t.indexOf('currency') > -1) currField = fields[i];
    }
  }

  // ─── Dropdown open/close ──────────────────────────────────────────────────────
  function closeAllDropdowns(exceptEl) {
    var drops = document.querySelectorAll('.filter-dropdown, .price-dropdown');
    for (var i = 0; i < drops.length; i++) {
      if (drops[i] === exceptEl) continue;
      drops[i].style.display = 'none';
      var f = drops[i].closest('.filter-field');
      if (f) { var t = f.querySelector('.filter-trigger'); if (t) t.classList.remove('is-active'); }
    }
    if (priceTrigger && exceptEl !== priceDropdown) priceTrigger.classList.remove('is-active');
    // close location dropdown
    if (locDropdown && locDropdown !== exceptEl && locDropOpen) {
      locDropOpen = false;
      locDropdown.style.display = 'none';
      if (locTrigger) locTrigger.classList.remove('is-active');
    }
  }

  function toggleFilterDrop(field) {
    var dd = field.querySelector('.filter-dropdown');
    var trig = field.querySelector('.filter-trigger');
    if (!dd) return;
    var isOpen = dd.style.display === 'block';
    closeAllDropdowns(isOpen ? null : dd);
    dd.style.display = isOpen ? 'none' : 'block';
    if (trig) trig.classList.toggle('is-active', !isOpen);
  }

  function togglePriceDrop() {
    var isOpen = priceDropdown.style.display === 'block';
    closeAllDropdowns(isOpen ? null : priceDropdown);
    priceDropdown.style.display = isOpen ? 'none' : 'block';
    priceTrigger.classList.toggle('is-active', !isOpen);
  }

  // ─── Init single select field ─────────────────────────────────────────────────
  function initSingle(field, cb) {
    if (!field) return;
    var trig = field.querySelector('.filter-trigger');
    var opts = field.querySelectorAll('.filter-option');
    var trigText = field.querySelector('.filter-trigger_text');
    if (!trig) return;

    trig.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFilterDrop(field);
    });

    for (var i = 0; i < opts.length; i++) {
      (function (opt) {
        opt.addEventListener('click', function (e) {
          e.stopPropagation();
          for (var k = 0; k < opts.length; k++) opts[k].classList.remove('is-active');
          opt.classList.add('is-active');
          if (trigText) trigText.textContent = opt.dataset.value;
          field.querySelector('.filter-dropdown').style.display = 'none';
          trig.classList.remove('is-active');
          if (cb) cb(opt.dataset.value);
        });
      })(opts[i]);
    }
  }

  // ─── Init multi select field ──────────────────────────────────────────────────
  function initMulti(field, cb) {
    if (!field) return;
    var trig = field.querySelector('.filter-trigger');
    var opts = field.querySelectorAll('.filter-option');
    var trigText = field.querySelector('.filter-trigger_text');
    if (!trig) return;

    trig.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleFilterDrop(field);
    });

    for (var i = 0; i < opts.length; i++) {
      (function (opt) {
        opt.addEventListener('click', function (e) {
          e.stopPropagation();
          var val = opt.dataset.value;
          var anyOpt = field.querySelector('[data-value="Any"]');
          if (val === 'Any') {
            for (var k = 0; k < opts.length; k++) opts[k].classList.remove('is-active');
            opt.classList.add('is-active');
          } else {
            if (anyOpt) anyOpt.classList.remove('is-active');
            opt.classList.toggle('is-active');
            var hasAny = false;
            for (var k = 0; k < opts.length; k++) if (opts[k].classList.contains('is-active')) { hasAny = true; break; }
            if (!hasAny && anyOpt) anyOpt.classList.add('is-active');
          }
          var sel = [];
          for (var k = 0; k < opts.length; k++) {
            if (opts[k].classList.contains('is-active') && opts[k].dataset.value !== 'Any') sel.push(opts[k].dataset.value);
          }
          if (trigText) trigText.textContent = sel.length ? sel.join(', ') : 'Any';
          if (cb) cb(sel);
        });
      })(opts[i]);
    }
  }

  // ─── Card data ────────────────────────────────────────────────────────────────
  function getData(card) {
    var w = card.querySelector('.listings_card-wrapper') || card;
    return {
      name:     (w.dataset.name || '').toLowerCase(),
      code:     (w.dataset.code || '').toLowerCase(),
      locRaw:   w.dataset.location || '',
      loc:      norm(w.dataset.location || ''),
      rooms:    parseInt(w.dataset.rooms || '0', 10),
      price:    parseFloat(w.dataset.price || '0'),
      currency: (w.dataset.currency || 'IDR').toUpperCase(),
      avail:    (w.dataset.availableDate || w.dataset.available || '').toLowerCase()
    };
  }

  // ─── Filter passes ────────────────────────────────────────────────────────────
  function passes(card) {
    var d = getData(card);

    // Availability
    if (state.availability !== 'Any') {
      if (state.availability === 'Available' && d.avail !== 'available') return false;
      if (state.availability === 'Rented' && d.avail !== 'rented') return false;
    }

    // Bedrooms
    if (state.bedrooms.length > 0) {
      var match = false;
      for (var i = 0; i < state.bedrooms.length; i++) {
        if (state.bedrooms[i] === '6+' && d.rooms >= 6) { match = true; break; }
        if (state.bedrooms[i] !== '6+' && d.rooms === parseInt(state.bedrooms[i], 10)) { match = true; break; }
      }
      if (!match) return false;
    }

    // Location
    if (state.locations.length > 0 && state.locations.indexOf(d.loc) === -1) return false;

    // Price
    if (state.priceMin !== null || state.priceMax !== null) {
      var price = isFinite(d.price) ? d.price : 0;
      if (state.priceMin !== null && price < state.priceMin) return false;
      if (state.priceMax !== null && price > state.priceMax) return false;
    }

    // Keyword
    if (state.keyword) {
      var kw = state.keyword.toLowerCase();
      if (d.name.indexOf(kw) === -1 && d.code.indexOf(kw) === -1) return false;
    }

    return true;
  }

  // ─── Apply & render ───────────────────────────────────────────────────────────
  function applyFilters() {
    filtered = allCards.filter(passes);
    visible = 0;
    showNext();
    if (resultsCount) resultsCount.textContent = filtered.length;
    if (emptyState) emptyState.style.display = filtered.length === 0 ? '' : 'none';
  }

  function showNext() {
    var next = Math.min(visible + STEP, filtered.length);
    for (var i = 0; i < allCards.length; i++) allCards[i].style.display = 'none';
    for (var i = 0; i < next; i++) filtered[i].style.display = '';
    visible = next;
    updateLoadMore();
  }

  function updateLoadMore() {
    if (btnLoadMore) btnLoadMore.style.display = visible < filtered.length ? '' : 'none';
    if (btnBackTop) btnBackTop.style.display = visible >= filtered.length && filtered.length > 0 ? 'flex' : 'none';
  }

  function injectBackToTop() {
    if (btnBackTop) return;
    btnBackTop = document.createElement('button');
    btnBackTop.innerHTML = '↑ Back to Top';
    btnBackTop.style.cssText = 'display:none;align-items:center;justify-content:center;padding:12px 28px;border-radius:12px;border:1.5px solid #3a2e28;background:#fff;font-size:14px;font-weight:500;color:#3a2e28;cursor:pointer;margin:16px auto 0;';
    btnBackTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    if (btnLoadMore && btnLoadMore.parentNode) btnLoadMore.parentNode.insertBefore(btnBackTop, btnLoadMore.nextSibling);
  }

  // ─── Currency ─────────────────────────────────────────────────────────────────
  function setCurrency(c) {
    c = (c === 'USD' || c === 'EUR') ? c : 'IDR';
    state.currency = c;
    // sync curr field UI
    if (currField) {
      var opts = currField.querySelectorAll('.filter-option');
      for (var i = 0; i < opts.length; i++) opts[i].classList.toggle('is-active', opts[i].dataset.value === c);
      var tt = currField.querySelector('.filter-trigger_text');
      if (tt) tt.textContent = c;
    }
    updateSlider();
    updateChips();
    applyFilters();
  }

  // ─── Clear ────────────────────────────────────────────────────────────────────
  function clearAll(e) {
    if (e) e.preventDefault();
    function resetField(field, label) {
      if (!field) return;
      var opts = field.querySelectorAll('.filter-option');
      for (var i = 0; i < opts.length; i++) opts[i].classList.remove('is-active');
      var any = field.querySelector('[data-value="Any"]');
      if (any) any.classList.add('is-active');
      var tt = field.querySelector('.filter-trigger_text');
      if (tt) tt.textContent = label || 'Any';
    }
    resetField(bedsField, 'Any');
    resetField(availField, 'Any');
    if (currField) {
      var opts = currField.querySelectorAll('.filter-option');
      for (var i = 0; i < opts.length; i++) opts[i].classList.remove('is-active');
      var idr = currField.querySelector('[data-value="IDR"]');
      if (idr) idr.classList.add('is-active');
      var tt = currField.querySelector('.filter-trigger_text');
      if (tt) tt.textContent = 'IDR';
    }
    if (kwInput) kwInput.value = '';
    minRatio = 0; maxRatio = 1;
    state.availability = 'Any';
    state.bedrooms = [];
    state.keyword = '';
    state.priceMin = null;
    state.priceMax = null;
    state.locations = [];
    draftLocs = [];
    updateLocText();
    syncMap([]);
    setCurrency('IDR');
  }

  // ─── Price slider ─────────────────────────────────────────────────────────────
  function computeBounds() {
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < allCards.length; i++) {
      var d = getData(allCards[i]);
      if (d.price > 0 && isFinite(d.price)) {
        if (d.price < lo) lo = d.price;
        if (d.price > hi) hi = d.price;
      }
    }
    if (isFinite(lo) && isFinite(hi)) { sliderBase.min = lo; sliderBase.max = hi; }
    sliderActive = { min: sliderBase.min, max: sliderBase.max };
  }

  function updateSlider() {
    sliderActive = { min: sliderBase.min, max: sliderBase.max };
    renderSlider();
  }

  function ratioToVal(r) { return sliderActive.min + r * (sliderActive.max - sliderActive.min); }
  function valToRatio(v) { return (v - sliderActive.min) / (sliderActive.max - sliderActive.min || 1); }

  function renderSlider() {
    var sym = symFor(state.currency);
    var minV = ratioToVal(minRatio);
    var maxV = ratioToVal(maxRatio);
    state.priceMin = minRatio <= 0 ? null : minV;
    state.priceMax = maxRatio >= 1 ? null : maxV;

    if (fillEl) {
      fillEl.style.left  = (minRatio * 100) + '%';
      fillEl.style.width = ((maxRatio - minRatio) * 100) + '%';
    }
    if (thumbMin) thumbMin.style.left = 'calc(' + (minRatio * 100) + '% - 10px)';
    if (thumbMax) thumbMax.style.left = 'calc(' + (maxRatio * 100) + '% - 10px)';

    var rText = document.getElementById('pwRangeText');
    if (rText) rText.textContent = sym + short(minV) + ' – ' + sym + short(maxV);

    var minT = document.getElementById('pwMinText');
    var maxT = document.getElementById('pwMaxText');
    if (minT) { if (minT.tagName === 'INPUT') minT.value = fmt(minV); else minT.textContent = fmt(minV); }
    if (maxT) { if (maxT.tagName === 'INPUT') maxT.value = fmt(maxV); else maxT.textContent = fmt(maxV); }

    var symMin = document.getElementById('pwSymbolMin');
    var symMax = document.getElementById('pwSymbolMax');
    if (symMin) symMin.textContent = sym;
    if (symMax) symMax.textContent = sym;

    var scMin = document.getElementById('pwScaleMin');
    var scMax = document.getElementById('pwScaleMax');
    if (scMin) scMin.textContent = sym + short(sliderActive.min);
    if (scMax) scMax.textContent = sym + short(sliderActive.max);

    var full = (minRatio <= 0 && maxRatio >= 1);
    if (priceTrigText) priceTrigText.textContent = full ? 'Price Range' : sym + short(minV) + ' – ' + sym + short(maxV);
  }

  function updateChips() {
    var c = state.currency;
    var presets = CHIP_PRESETS[c] || CHIP_PRESETS.IDR;
    var chips = document.querySelectorAll('.pw-chip');
    for (var i = 0; i < chips.length; i++) {
      var p = presets[i]; if (!p) continue;
      chips[i].dataset.min = String(p.min);
      chips[i].dataset.max = String(p.max !== null ? p.max : sliderActive.max);
      var tn = chips[i].querySelector('.text-node');
      if (tn) tn.textContent = p.label; else chips[i].textContent = p.label;
    }
  }

  function initSlider() {
    fillEl  = document.getElementById('pwFill');
    trackEl = document.querySelector('.pw-track');
    var sw  = document.querySelector('.pw-slider');
    if (!sw || !fillEl) return;

    // Hide native inputs
    var embed = sw.querySelector('.w-embed, .code-embed-6');
    if (embed) embed.style.display = 'none';

    // Inject thumbs
    thumbMin = document.createElement('div');
    thumbMin.className = 'pw-thumb pw-thumb-min';
    thumbMin.style.cssText = 'position:absolute;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;background:#fff;border:2px solid #3a2e28;cursor:grab;z-index:3;';
    thumbMax = document.createElement('div');
    thumbMax.className = 'pw-thumb pw-thumb-max';
    thumbMax.style.cssText = thumbMin.style.cssText;
    sw.appendChild(thumbMin);
    sw.appendChild(thumbMax);

    var DRAGGING = null, dragTimer = null;

    function getR(clientX) {
      var rect = trackEl ? trackEl.getBoundingClientRect() : sw.getBoundingClientRect();
      return clamp((clientX - rect.left) / rect.width, 0, 1);
    }
    function onMove(clientX) {
      if (!DRAGGING) return;
      var r = getR(clientX);
      if (DRAGGING === 'min') minRatio = clamp(r, 0, maxRatio - 0.001);
      else maxRatio = clamp(r, minRatio + 0.001, 1);
      renderSlider();
      clearTimeout(dragTimer);
      dragTimer = setTimeout(applyFilters, 60);
    }
    function onUp() {
      DRAGGING = null;
      document.removeEventListener('mousemove', onMM);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onTM);
      document.removeEventListener('touchend', onUp);
      applyFilters();
    }
    function onMM(e) { onMove(e.clientX); }
    function onTM(e) { e.preventDefault(); onMove(e.touches[0].clientX); }
    function startDrag(which, e) {
      DRAGGING = which; e.preventDefault();
      if (e.type === 'mousedown') { document.addEventListener('mousemove', onMM); document.addEventListener('mouseup', onUp); }
      else { document.addEventListener('touchmove', onTM, { passive: false }); document.addEventListener('touchend', onUp); }
    }

    thumbMin.addEventListener('mousedown',  function (e) { startDrag('min', e); });
    thumbMin.addEventListener('touchstart', function (e) { startDrag('min', e); }, { passive: false });
    thumbMax.addEventListener('mousedown',  function (e) { startDrag('max', e); });
    thumbMax.addEventListener('touchstart', function (e) { startDrag('max', e); }, { passive: false });

    if (trackEl) {
      trackEl.style.cursor = 'pointer';
      trackEl.addEventListener('mousedown', function (e) {
        var r = getR(e.clientX);
        DRAGGING = Math.abs(r - minRatio) < Math.abs(r - maxRatio) ? 'min' : 'max';
        onMove(e.clientX);
        document.addEventListener('mousemove', onMM);
        document.addEventListener('mouseup', onUp);
      });
    }

    // Chips
    var chips = document.querySelectorAll('.pw-chip');
    for (var i = 0; i < chips.length; i++) {
      (function (ch) {
        ch.addEventListener('click', function () {
          var cMin = Number(ch.dataset.min);
          var cMax = Number(ch.dataset.max);
          minRatio = valToRatio(cMin);
          maxRatio = valToRatio(cMax);
          renderSlider();
          applyFilters();
        });
      })(chips[i]);
    }

    updateChips();
    renderSlider();
  }

  // ─── Location ─────────────────────────────────────────────────────────────────
  function buildAreas() {
    var locSet = {};
    for (var i = 0; i < allCards.length; i++) {
      var d = getData(allCards[i]);
      if (!d.loc) continue;
      locSet[d.loc] = true;
      if (!labelByNorm[d.loc]) labelByNorm[d.loc] = d.locRaw;
    }
    var cmsLocs = Object.keys(locSet);
    var used = {};
    areas = [];
    for (var a = 0; a < AREA_RULES.length; a++) {
      var rule = AREA_RULES[a];
      var kids = cmsLocs.filter(function (l) { var h = rule.keys.indexOf(l) > -1; if (h) used[l] = true; return h; });
      if (kids.length) areas.push({ id: rule.id, label: rule.label, children: kids });
    }
    var other = cmsLocs.filter(function (l) { return !used[l]; });
    if (other.length) areas.push({ id: 'other', label: 'Other', children: other });
  }

  function mountLocUI() {
    if (!locDropdown) return;
    var panel = locDropdown.querySelector('.location-panel');
    if (!panel) return;

    // Replace div.location-search-input with real input
    var lsDiv = panel.querySelector('.location-search-input');
    if (lsDiv && lsDiv.tagName !== 'INPUT') {
      var inp = document.createElement('input');
      inp.type = 'text'; inp.placeholder = 'Search location...'; inp.className = 'location-search-input';
      inp.style.cssText = 'width:100%;padding:6px 10px;border:1px solid #e5e0db;border-radius:8px;font-size:13px;box-sizing:border-box;';
      lsDiv.parentNode.replaceChild(inp, lsDiv);
    }

    locUI = {
      search:    panel.querySelector('.location-search-input'),
      tree:      panel.querySelector('.tree-scroll'),
      pills:     panel.querySelector('.pill-scroll'),
      info:      panel.querySelector('.loc-selected-info'),
      btnClear:  panel.querySelector('.loc-btn-clear-inline'),
      btnApply:  panel.querySelector('.loc-btn-apply-inline')
    };

    if (locUI.search) locUI.search.addEventListener('input', renderLocTree);
    if (locUI.btnClear) locUI.btnClear.addEventListener('click', function (e) {
      e.preventDefault(); draftLocs = []; renderLocTree(); syncMap(draftLocs); updateLocInfo();
    });
    if (locUI.btnApply) locUI.btnApply.addEventListener('click', function (e) {
      e.preventDefault(); commitLoc();
    });
  }

  function renderLocTree() {
    if (!locUI.tree) return;
    var q = norm(locUI.search ? locUI.search.value : '');
    locUI.tree.innerHTML = '';
    if (locUI.pills) locUI.pills.innerHTML = '';

    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];
      var aHit = !q || norm(area.label).indexOf(q) > -1;
      var kids = area.children.filter(function (c) { return aHit || c.indexOf(q) > -1; });
      if (!kids.length) continue;
      var aActive = area.children.some(function (c) { return draftLocs.indexOf(c) > -1; });

      // Tree item
      var item = document.createElement('div'); item.className = 'tree-item';
      var par = document.createElement('div');
      par.className = 'tree-parent' + (aActive ? ' is-active' : '');
      par.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px;cursor:pointer;border-radius:8px;font-weight:500;font-size:14px;';
      par.innerHTML = '<img src="' + PIN_URL + '" style="width:16px;height:16px;" alt=""><span>' + area.label + '</span><span style="margin-left:auto;font-size:10px;">▾</span>';

      var childWrap = document.createElement('div');
      childWrap.style.cssText = 'display:none;padding-left:24px;';
      (function (cw) { par.addEventListener('click', function () { cw.style.display = cw.style.display === 'none' ? 'block' : 'none'; }); })(childWrap);

      for (var k = 0; k < kids.length; k++) {
        (function (loc) {
          var row = document.createElement('div');
          row.style.cssText = 'padding:6px 8px;cursor:pointer;border-radius:6px;font-size:13px;display:flex;align-items:center;gap:6px;';
          if (draftLocs.indexOf(loc) > -1) row.style.background = '#3a2e28', row.style.color = '#fff';
          row.innerHTML = '<img src="' + PIN_URL + '" style="width:12px;height:12px;" alt=""><span>' + (labelByNorm[loc] || loc) + '</span>';
          row.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = draftLocs.indexOf(loc);
            if (idx > -1) draftLocs.splice(idx, 1); else draftLocs.push(loc);
            renderLocTree(); syncMap(draftLocs);
          });
          childWrap.appendChild(row);
        })(kids[k]);
      }

      item.appendChild(par); item.appendChild(childWrap);
      locUI.tree.appendChild(item);

      // Pill
      if (locUI.pills) {
        var pill = document.createElement('div');
        pill.style.cssText = 'padding:5px 12px;border:1.5px solid ' + (aActive ? '#3a2e28' : '#e5e0db') + ';border-radius:20px;font-size:12px;cursor:pointer;' + (aActive ? 'background:#3a2e28;color:#fff;' : '');
        pill.textContent = area.label;
        (function (aObj) {
          pill.addEventListener('click', function () {
            var allOn = aObj.children.every(function (c) { return draftLocs.indexOf(c) > -1; });
            if (allOn) draftLocs = draftLocs.filter(function (l) { return aObj.children.indexOf(l) === -1; });
            else aObj.children.forEach(function (c) { if (draftLocs.indexOf(c) === -1) draftLocs.push(c); });
            renderLocTree(); syncMap(draftLocs);
          });
        })(area);
        locUI.pills.appendChild(pill);
      }
    }
    updateLocInfo();
  }

  function updateLocInfo() {
    if (!locUI.info) return;
    var n = draftLocs.length;
    locUI.info.textContent = n === 0 ? 'No location selected' : n === 1 ? (labelByNorm[draftLocs[0]] || draftLocs[0]) : n + ' locations selected';
  }

  function updateLocText() {
    if (!locTrigText) return;
    var n = state.locations.length;
    locTrigText.textContent = n === 0 ? 'All Location' : n === 1 ? (labelByNorm[state.locations[0]] || state.locations[0]) : n + ' locations';
  }

  function commitLoc() {
    state.locations = draftLocs.slice();
    updateLocText();
    syncMap(state.locations);
    closeLocDrop();
    applyFilters();
  }

  function openLocDrop() {
    locDropOpen = true;
    locDropdown.style.display = 'block';
    if (locTrigger) locTrigger.classList.add('is-active');
    draftLocs = state.locations.slice();
    renderLocTree();
    syncMap(draftLocs);
    if (!map) loadMap(initMap); else setTimeout(function () { map.resize(); }, 80);
  }

  function closeLocDrop() {
    locDropOpen = false;
    if (locDropdown) locDropdown.style.display = 'none';
    if (locTrigger) locTrigger.classList.remove('is-active');
  }

  // ─── Map ──────────────────────────────────────────────────────────────────────
  function loadMap(cb) {
    if (window.maptilersdk) return cb();
    if (!document.querySelector('link[data-mt]')) {
      var css = document.createElement('link'); css.rel = 'stylesheet';
      css.href = 'https://cdn.maptiler.com/maptiler-sdk-js/v3.10.2/maptiler-sdk.css';
      css.setAttribute('data-mt', '1'); document.head.appendChild(css);
    }
    var s = document.createElement('script');
    s.src = 'https://cdn.maptiler.com/maptiler-sdk-js/v3.10.2/maptiler-sdk.umd.min.js';
    s.async = true; s.onload = cb; document.head.appendChild(s);
  }

  function initMap() {
    if (map) return;
    var el = document.getElementById('bhbMap');
    if (!el || !window.maptilersdk) return;
    maptilersdk.config.apiKey = MAPTILER_KEY;
    map = new maptilersdk.Map({ container: 'bhbMap', style: MAP_STYLE, center: [115.19, -8.41], zoom: 9.3 });
    map.on('load', function () { mapReady = true; syncMap(state.locations); setTimeout(function () { map.resize(); }, 80); });
  }

  function syncMap(locs) {
    if (!map || !mapReady) return;
    for (var i = 0; i < markers.length; i++) markers[i].remove();
    markers = [];
    if (!locs || !locs.length) { map.flyTo({ center: [115.19, -8.41], zoom: 9.3, duration: 400 }); return; }
    var pts = [], seen = {};
    for (var i = 0; i < locs.length; i++) {
      var p = LOC_COORDS[locs[i]]; if (!p) continue;
      var k = p.join(','); if (seen[k]) continue; seen[k] = true;
      var el2 = document.createElement('div');
      el2.innerHTML = '<img src="' + PIN_URL + '" style="width:26px;height:26px;">';
      markers.push(new maptilersdk.Marker({ element: el2, anchor: 'bottom' }).setLngLat(p).addTo(map));
      pts.push(p);
    }
    if (pts.length === 1) { map.flyTo({ center: pts[0], zoom: 12, duration: 400 }); return; }
    var b = new maptilersdk.LngLatBounds();
    pts.forEach(function (p) { b.extend(p); });
    map.fitBounds(b, { padding: 40, maxZoom: 12, duration: 400 });
  }

  // ─── Bind events ──────────────────────────────────────────────────────────────
  function bindEvents() {
    initMulti(bedsField, function (sel) { state.bedrooms = sel; applyFilters(); });
    initSingle(availField, function (val) { state.availability = val; applyFilters(); });
    initSingle(currField, function (val) { setCurrency(val); });

    if (kwInput) {
      var kwForm = kwInput.closest('form');
      if (kwForm) kwForm.addEventListener('submit', function (e) { e.preventDefault(); });
      var kwTimer;
      kwInput.addEventListener('input', function () {
        clearTimeout(kwTimer);
        kwTimer = setTimeout(function () { state.keyword = kwInput.value.trim(); applyFilters(); }, 300);
      });
      kwInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); state.keyword = kwInput.value.trim(); applyFilters(); }
      });
    }

    if (priceTrigger) {
      priceTrigger.addEventListener('click', function (e) { e.stopPropagation(); togglePriceDrop(); });
    }
    if (priceDropdown) {
      priceDropdown.addEventListener('click', function (e) { e.stopPropagation(); });
    }

    if (locTrigger) {
      locTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (locDropOpen) closeLocDrop(); else openLocDrop();
      });
    }
    if (locDropdown) locDropdown.addEventListener('click', function (e) { e.stopPropagation(); });

    if (btnClear) btnClear.addEventListener('click', clearAll);
    if (btnSearch) btnSearch.addEventListener('click', function (e) { e.preventDefault(); commitLoc(); applyFilters(); closeAllDropdowns(); });
    if (btnLoadMore) btnLoadMore.addEventListener('click', function (e) { e.preventDefault(); showNext(); });

    document.addEventListener('click', function () { closeAllDropdowns(); if (locDropOpen) closeLocDrop(); });

    window.addEventListener('bhb:currency-changed', function (e) {
      if (e.detail && e.detail.currency) setCurrency(e.detail.currency);
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────────
  function init() {
    cacheDom();
    if (!grid) return;

    // Hide all dropdowns
    var drops = document.querySelectorAll('.filter-dropdown, .price-dropdown, .location-dropdown');
    for (var i = 0; i < drops.length; i++) drops[i].style.display = 'none';

    allCards = Array.from(grid.querySelectorAll(CARD_SEL));
    if (!allCards.length) return;

    buildAreas();
    mountLocUI();
    computeBounds();
    initSlider();
    injectBackToTop();
    updateLocText();
    bindEvents();
    setCurrency('IDR');
    filtered = allCards.slice();
    showNext();
    if (resultsCount) resultsCount.textContent = filtered.length;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();