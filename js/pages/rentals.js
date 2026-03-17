(function () {
  "use strict";

  // prevent double init
  if (window.__bhbFilterInited) return;
  window.__bhbFilterInited = true;

  // ─── config ───────────────────────────────────────────────────────────────
  var CFG = { GRID_ID: "rentals-wrapper", CARD_SEL: ".w-dyn-item", STEP: 9 };
  var MAPTILER_KEY = "c43H8q7pFefMtElMtWBS";
  var MAP_STYLE = "019c8e23-ebd1-7221-bd5f-20ae2dca2ab6";
  var PIN_URL =
    "https://cdn.prod.website-files.com/67344ae68adf4fc1f539002d/69a009335d3c16a421dd917a_Icon.svg";

  // ─── area groupings for location filter ───────────────────────────────────
  var AREA_RULES = [
    { id: 'uluwatu-area', label: 'Uluwatu area', keys: ['uluwatu', 'ungasan', 'pecatu'] },
    { id: 'canggu-area',  label: 'Canggu area',  keys: ['canggu', 'batu bolong', 'dalung', 'pererenan', 'tumbak bayuh', 'buduk', 'cemagi', 'seseh'] },
    { id: 'tabanan-area', label: 'Tabanan area', keys: ['kedungu', 'nyanyi', 'tanah lot', 'cepaka', 'buwit', 'kaba kaba', 'kaba-kaba'] },
    { id: 'ubud-area',    label: 'Ubud area',    keys: ['ubud'] }
  ];

  // ─── map pin coordinates per location ─────────────────────────────────────
  var LOC_COORDS = {
    'cepaka':       [115.14526, -8.59917],
    'kaba kaba':    [115.13919, -8.59345],
    'kaba-kaba':    [115.13919, -8.59345],
    'buwit':        [115.12362, -8.59905],
    'tumbak bayuh': [115.14562, -8.61484],
    'munggu':       [115.12771, -8.61925],
    'buduk':        [115.16356, -8.60776],
    'nyanyi':       [115.11025, -8.61237],
    'seseh':        [115.11505, -8.64560],
    'kedungu':      [115.09045, -8.60254],
    'dalung':       [115.17258, -8.61147],
    'ubud':         [115.26229, -8.50690],
    'uluwatu':      [115.08800, -8.82828],
    'ungasan':      [115.16562, -8.82695],
    'pecatu':       [115.12493, -8.83279],
    'cemagi':       [115.11502, -8.62971],
    'tanah lot':    [115.12604, -8.58208],
    'canggu':       [115.13650, -8.65062],
    'pererenan':    [115.12346, -8.64904]
  };
  // ─── PRICE FILTERING SYSTEM ──────────────────────────────────────────────────
  //
  // RENTALS: Dynamic price range from monthly rental prices
  //
  // The price filter has three components:
  //   1. PRICE RANGE: Calculated min/max from CMS monthly rental prices
  //   2. QUICK SELECTION: Three preset chips dividing range into equal thirds
  //   3. CUSTOM RANGE: User-adjustable slider bounds within price range
  //
  // Range Calculation:
  //   - Scans all rental listings in CMS
  //   - Extracts monthly rental prices (data-price)
  //   - Converts to IDR (base currency) for consistent calculation
  //   - Sets slider.base = { min, max } in IDR
  //   - Generates three chips by dividing range by 3
  //
  // Quick Selection Algorithm:
  //   range = max - min
  //   tier1 = min + (range / 3)           // chip 1 max
  //   tier2 = min + (2 × range / 3)       // chip 2 max
  //   Chips:
  //     < tier1
  //     tier1 – tier2
  //     > tier2
  //
  // Currency Handling:
  //   - All calculations done in IDR (base)
  //   - Display values converted to user's selected currency (IDR/USD/EUR)
  //   - Slider updates when currency changes
  //   - Chip labels updated with proper currency symbols
  //

  // ─── price chip presets per currency ──────────────────────────────────────
  var CHIP_PRESETS = {
    IDR: [
      { label: "< 50jt", min: 0, max: 50000000 },
      { label: "50jt \u2013 200jt", min: 50000000, max: 200000000 },
      { label: "> 200jt", min: 200000000, max: null },
    ],
    USD: [
      { label: "< $3k", min: 0, max: 3000 },
      { label: "$3k \u2013 $12k", min: 3000, max: 12000 },
      { label: "> $12k", min: 12000, max: null },
    ],
    EUR: [
      { label: "< \u20ac3k", min: 0, max: 3000 },
      { label: "\u20ac3k \u2013 \u20ac12k", min: 3000, max: 12000 },
      { label: "> \u20ac12k", min: 12000, max: null },
    ],
  };

  // ─── state ────────────────────────────────────────────────────────────────
  var allCards = [],
    filtered = [],
    visible = 0;
  var locDropOpen = false,
    map = null,
    mapReady = false,
    markers = [],
    locMap = null,
    locMapReady = false,
    locMapMarkers = [];
  var areas = [],
    draftLocs = [],
    labelByNorm = {};

  var state = {
    availability: "Any",
    bedrooms: [],
    locations: [],
    currency: "IDR",
    priceMin: null,
    priceMax: null,
    keyword: "",
  };

  var slider = {
    base: { min: 0, max: 5000000 }, // raw IDR bounds from CMS
    active: { min: 0, max: 5000000 }, // converted to selected currency
    minRatio: 0,
    maxRatio: 1,
  };

  var el = {},
    locUI = {};

  // ─── helpers ──────────────────────────────────────────────────────────────

  // normalise strings for comparison
  function norm(v) {
    return String(v || "")
      .toLowerCase()
      .trim()
      .replace(/[-\u2013\u2014]/g, " ")
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ");
  }

  // validate currency code
  function normCurrency(v) {
    var c = String(v || "")
      .trim()
      .toUpperCase();
    return c === "USD" || c === "EUR" || c === "IDR" ? c : "IDR";
  }

  // shorten large numbers for display
  function short(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(".0", "") + "B";
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "") + "M";
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(".0", "") + "k";
    return String(Math.round(n));
  }

  function symFor(c) {
    return c === "USD" ? "$" : c === "EUR" ? "\u20ac" : "Rp";
  }

  function getCurrentSym() {
    return symFor(state.currency);
  }

  // ─── currency conversion ──────────────────────────────────────────────────
  // relies on window.debugCurrency.convertAmount exposed by the global currency script.
  // if rates aren't loaded yet, returns the raw amount unchanged —
  // bounds are recomputed once bhb:rates-ready fires.
  function convertAmount(amount, from, to) {
    if (from === to) return amount;
    if (
      window.debugCurrency &&
      typeof window.debugCurrency.convertAmount === "function"
    ) {
      return window.debugCurrency.convertAmount(amount, from, to);
    }
    return amount;
  }

  // read saved currency from localStorage
  function savedCurrency() {
    try {
      return normCurrency(localStorage.getItem("selectedCurrency") || "IDR");
    } catch (e) {
      return "IDR";
    }
  }

  // ─── dropdown helpers ─────────────────────────────────────────────────────

  function closeAll(except) {
    var drops = document.querySelectorAll(
      ".filter-dropdown,.price-dropdown,.location-dropdown",
    );
    for (var i = 0; i < drops.length; i++) {
      if (drops[i] !== except) {
        drops[i].style.display = "none";
        drops[i].classList.remove("is-open");
        var field = drops[i].closest(".filter-field");
        if (field) {
          var trig = field.querySelector(
            ".filter-trigger,.price-trigger,.location-trigger",
          );
          if (trig) trig.classList.remove("is-active");
        }
      }
    }
    if (locDropOpen && el.locDropdown && el.locDropdown !== except) {
      locDropOpen = false;
      if (el.locTrigger) el.locTrigger.classList.remove("is-active");
    }
  }

  function toggleDrop(dd) {
    var isOpen = dd.style.display === "block";
    closeAll();
    if (!isOpen) {
      dd.style.display = "block";
      dd.getBoundingClientRect();
      dd.classList.add("is-open");
      var field = dd.closest(".filter-field");
      if (field) {
        var trig = field.querySelector(".filter-trigger,.price-trigger");
        if (trig) trig.classList.add("is-active");
      }
    }
  }

  // ─── DOM cache ────────────────────────────────────────────────────────────

  function cacheEls() {
    el = {
      keywordInput:
        document.querySelector(".keyword-input") ||
        (function () {
          var fields = document.querySelectorAll(
            ".rent-filter_top .filter-field",
          );
          for (var i = 0; i < fields.length; i++) {
            var inp = fields[i].querySelector(
              'input[type="text"],input[type="search"]',
            );
            if (inp && !inp.classList.contains("location-search-input"))
              return inp;
          }
          return null;
        })(),
      locTrigger: document.querySelector(".location-trigger"),
      locTrigText: document.querySelector(".location-trigger_text"),
      locDropdown: document.querySelector(".location-dropdown"),
      priceTrigger: document.querySelector(".price-trigger"),
      priceTrigText: document.querySelector(".price-trigger_text"),
      priceDropdown: document.querySelector(".price-dropdown"),
      btnClear: document.querySelector(".filter-button-1"),
      btnSearch: document.querySelector(".filter-button-2"),
      resultsCount: document.getElementById("rental-results-count"),
      emptyState: document.getElementById("rental-empty-state"),
      btnLoadMore: document.getElementById("load-more"),
      btnBackTop: null,
      grid: document.getElementById(CFG.GRID_ID),
    };

    // detect filter fields by their option values
    var fields = document.querySelectorAll(".filter-field");
    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      var opts = field.querySelectorAll(".filter-option");
      if (!opts.length) continue;
      var vals = [];
      for (var j = 0; j < opts.length; j++)
        vals.push(opts[j].dataset.value || "");
      if (vals.indexOf("Available") > -1 || vals.indexOf("Rented") > -1) {
        el.availField = field;
        el.availTrigText = field.querySelector(".filter-trigger_text");
      }
      if (vals.indexOf("1") > -1 && vals.indexOf("2") > -1) {
        el.bedsField = field;
        el.bedsTrigText = field.querySelector(".filter-trigger_text");
      }
      if (vals.indexOf("IDR") > -1 || vals.indexOf("USD") > -1) {
        el.currField = field;
        el.currTrigText = field.querySelector(".filter-trigger_text");
      }
    }
  }

  // ─── filter field init ────────────────────────────────────────────────────

  // single-select dropdown (availability, currency)
  function initSingle(field, onPick) {
    if (!field) return;
    var trigger = field.querySelector(".filter-trigger");
    var dd = field.querySelector(".filter-dropdown");
    var trigText = field.querySelector(".filter-trigger_text");
    var opts = field.querySelectorAll(".filter-option");
    if (!trigger || !dd) return;
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDrop(dd);
    });
    for (var i = 0; i < opts.length; i++) {
      (function (opt) {
        opt.addEventListener("click", function (e) {
          e.stopPropagation();
          for (var k = 0; k < opts.length; k++)
            opts[k].classList.remove("is-active");
          opt.classList.add("is-active");
          if (trigText) trigText.textContent = opt.dataset.value;
          dd.style.display = "none";
          dd.classList.remove("is-open");
          var f2 = dd.closest(".filter-field");
          if (f2) {
            var t2 = f2.querySelector(".filter-trigger");
            if (t2) t2.classList.remove("is-active");
          }
          if (onPick) onPick(opt.dataset.value);
        });
      })(opts[i]);
    }
    dd.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  // multi-select dropdown (bedrooms)
  function initMulti(field, onPick) {
    if (!field) return;
    var trigger = field.querySelector(".filter-trigger");
    var dd = field.querySelector(".filter-dropdown");
    var trigText = field.querySelector(".filter-trigger_text");
    var opts = field.querySelectorAll(".filter-option");
    if (!trigger || !dd) return;
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDrop(dd);
    });
    for (var i = 0; i < opts.length; i++) {
      (function (opt) {
        opt.addEventListener("click", function (e) {
          e.stopPropagation();
          var val = opt.dataset.value;
          var anyOpt = field.querySelector('.filter-option[data-value="Any"]');
          if (val === "Any") {
            for (var k = 0; k < opts.length; k++)
              opts[k].classList.remove("is-active");
            opt.classList.add("is-active");
          } else {
            if (anyOpt) anyOpt.classList.remove("is-active");
            opt.classList.toggle("is-active");
            var hasActive = false;
            for (var k = 0; k < opts.length; k++) {
              if (opts[k].classList.contains("is-active")) {
                hasActive = true;
                break;
              }
            }
            if (!hasActive && anyOpt) anyOpt.classList.add("is-active");
          }
          var selected = [];
          for (var k = 0; k < opts.length; k++) {
            if (
              opts[k].classList.contains("is-active") &&
              opts[k].dataset.value !== "Any"
            )
              selected.push(opts[k].dataset.value);
          }
          if (trigText)
            trigText.textContent = selected.length
              ? selected.join(", ")
              : "Any";
          if (onPick) onPick(selected);
        });
      })(opts[i]);
    }
    dd.addEventListener("click", function (e) {
      e.stopPropagation();
    });
  }

  // ─── state collection ─────────────────────────────────────────────────────

  function collectState() {
    if (el.availField) {
      var a = el.availField.querySelector(".filter-option.is-active");
      state.availability = a ? a.dataset.value : "Any";
    }
    if (el.bedsField) {
      var actives = el.bedsField.querySelectorAll(".filter-option.is-active");
      state.bedrooms = [];
      for (var i = 0; i < actives.length; i++) {
        if (actives[i].dataset.value !== "Any")
          state.bedrooms.push(actives[i].dataset.value);
      }
    }
    if (el.currField) {
      var c = el.currField.querySelector(".filter-option.is-active");
      if (c) state.currency = normCurrency(c.dataset.value);
    }
    if (el.keywordInput) state.keyword = el.keywordInput.value.trim();
  }

  // ─── clear all filters ────────────────────────────────────────────────────

  function clearAll(e) {
    if (e) e.preventDefault();
    function resetToAny(field, trigText, label) {
      if (!field) return;
      var opts = field.querySelectorAll(".filter-option");
      for (var i = 0; i < opts.length; i++)
        opts[i].classList.remove("is-active");
      var anyOpt = field.querySelector('.filter-option[data-value="Any"]');
      if (anyOpt) anyOpt.classList.add("is-active");
      if (trigText) trigText.textContent = label || "Any";
    }
    resetToAny(el.availField, el.availTrigText, "Any");
    resetToAny(el.bedsField, el.bedsTrigText, "Any");
    if (el.currField) {
      var opts = el.currField.querySelectorAll(".filter-option");
      for (var i = 0; i < opts.length; i++)
        opts[i].classList.remove("is-active");
      var idrOpt = el.currField.querySelector(
        '.filter-option[data-value="IDR"]',
      );
      if (idrOpt) idrOpt.classList.add("is-active");
      if (el.currTrigText) el.currTrigText.textContent = "IDR";
    }
    if (el.keywordInput) el.keywordInput.value = "";
    slider.minRatio = 0;
    slider.maxRatio = 1;
    state.availability = "Any";
    state.bedrooms = [];
    state.keyword = "";
    state.currency = "IDR";
    state.priceMin = null;
    state.priceMax = null;
    state.locations = [];
    draftLocs = [];
    updateLocText();
    syncMap();
    setCurrency("IDR");
  }

  function closeMobilePanel() {
    closeAll();
    if (locDropOpen) openLocDrop(false);
    var form = document.querySelector('.rent-filter_form');
    if (form) form.classList.remove('is-mobile-open');
    var overlay = document.getElementById('bhbOverlay');
    if (overlay) overlay.style.display = '';
    document.body.style.overflow = '';
  }

  // ─── event binding ────────────────────────────────────────────────────────

  function bindEvents() {
    initSingle(el.availField, function (val) {
      state.availability = val;
      applyFilters();
    });
    initMulti(el.bedsField, function (selected) {
      state.bedrooms = selected;
      applyFilters();
    });
    initSingle(el.currField, function (val) {
      setCurrency(val);
    });

    // keyword search — fires on enter or after 300ms pause
    if (el.keywordInput) {
      el.keywordInput.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        state.keyword = el.keywordInput.value.trim();
        applyFilters();
      });
      var kwTimer;
      el.keywordInput.addEventListener("input", function () {
        clearTimeout(kwTimer);
        kwTimer = setTimeout(function () {
          state.keyword = el.keywordInput.value.trim();
          applyFilters();
        }, 300);
      });
    }

    if (el.btnClear) el.btnClear.addEventListener("click", clearAll);

    if (el.btnSearch) {
      el.btnSearch.addEventListener("click", function (e) {
        e.preventDefault();
        collectState();
        applyFilters();
        closeAll();
        if (locDropOpen) openLocDrop(false);
      });
    }

    var closeBtns = document.querySelectorAll(".close-btn");
    for (var i = 0; i < closeBtns.length; i++) {
      closeBtns[i].addEventListener("click", function (e) {
        e.stopPropagation();
        closeMobilePanel();
      });
    }

    // mobile collapsed search trigger → open bottom sheet
    var mobileSearchTrigger = document.querySelector(".bhb-mobile-search-trigger");
    if (mobileSearchTrigger) {
      mobileSearchTrigger.addEventListener("click", function () {
        var form = document.querySelector(".rent-filter_form");
        var overlay = document.getElementById("bhbOverlay");
        if (form) form.classList.add("is-mobile-open");
        if (overlay) overlay.style.display = "block";
        document.body.style.overflow = "hidden";
      });
    }

    // overlay click → close panel
    var overlay = document.getElementById("bhbOverlay");
    if (overlay) {
      overlay.addEventListener("click", function () {
        closeMobilePanel();
      });
    }

    if (el.btnLoadMore) {
      el.btnLoadMore.addEventListener("click", function (e) {
        e.preventDefault();
        showNext();
      });
    }

    if (el.priceTrigger && el.priceDropdown) {
      el.priceTrigger.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleDrop(el.priceDropdown);
      });
      el.priceDropdown.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    if (el.locTrigger) {
      el.locTrigger.addEventListener("click", function (e) {
        e.stopPropagation();
        closeAll(el.locDropdown);
        openLocDrop();
        if (locDropOpen) {
          if (!map) loadMapSDK(initMap);
          else setTimeout(function () { map.resize(); }, 250);
          if (!locMap) loadMapSDK(initLocMap);
          else setTimeout(function () { locMap.resize(); }, 250);
        }
      });
    }

    if (el.locDropdown) {
      el.locDropdown.addEventListener("click", function (e) {
        e.stopPropagation();
      });
    }

    // close dropdowns when clicking outside
    document.addEventListener("click", function (e) {
      var inFilter = false;
      var zones = document.querySelectorAll(
        ".filter-field,.price-trigger,.price-dropdown,.location-trigger,.location-dropdown",
      );
      for (var i = 0; i < zones.length; i++) {
        if (zones[i].contains(e.target)) {
          inFilter = true;
          break;
        }
      }
      if (!inFilter) {
        if (locDropOpen) {
          commitDraft();
          openLocDrop(false);
        }
        closeAll();
      }
    });

    // sync filter currency when global currency script changes it
    window.addEventListener("bhb:currency-changed", function (e) {
      var c =
        e.detail && e.detail.currency ? e.detail.currency : savedCurrency();
      setCurrency(c);
    });

    // recompute slider bounds once exchange rates are loaded.
    // the global currency script fires bhb:rates-ready after fetching rates,
    // and exposes window.debugCurrency.convertAmount so convertAmount() works.
    // without this, CMS prices in USD/EUR are not converted before bounds are set.
    window.addEventListener("bhb:rates-ready", function () {
      computeBaseBounds();
      updateSliderForCurrency(state.currency);
      updateChips(state.currency);
    });
  }

  // ─── card data ────────────────────────────────────────────────────────────

  function getData(card) {
    var inner = card.querySelector(".listings_card-wrapper") || card;
    return {
      name: (inner.dataset.name || "").toLowerCase(),
      code: (inner.dataset.code || "").toLowerCase(),
      locRaw: inner.dataset.location || "",
      loc: norm(inner.dataset.location || ""),
      rooms: parseInt(inner.dataset.rooms || "0", 10),
      price: parseFloat(inner.dataset.price || "0"),
      currency: (inner.dataset.currency || "").toUpperCase(),
      avail: inner.dataset.availableDate ? "Rented" : "Available",
    };
  }

  // ─── filter logic ─────────────────────────────────────────────────────────

  // price check uses the displayed .price element (already converted by global script)
  // falls back to raw data-price if display value isn't available
  function passesPrice(d, card) {
    var el2 = card.querySelector(".price");
    var txt = el2 ? el2.textContent.trim() : "";
    var dsp = txt ? parseInt(txt.replace(/[^\d]/g, ""), 10) : NaN;
    var price = isFinite(dsp) ? dsp : d.price;
    if (state.priceMin !== null && price < state.priceMin) return false;
    if (state.priceMax !== null && price > state.priceMax) return false;
    return true;
  }

  function passes(card) {
    var d = getData(card);
    if (state.availability !== "Any" && d.avail !== state.availability)
      return false;
    if (state.bedrooms.length > 0) {
      var match = false;
      for (var i = 0; i < state.bedrooms.length; i++) {
        var b = state.bedrooms[i];
        if (b === "6+" && d.rooms >= 6) {
          match = true;
          break;
        }
        if (b !== "6+" && d.rooms === parseInt(b, 10)) {
          match = true;
          break;
        }
      }
      if (!match) return false;
    }
    if (state.locations.length > 0 && state.locations.indexOf(d.loc) === -1)
      return false;
    if (!passesPrice(d, card)) return false;
    if (state.keyword) {
      var kw = state.keyword.toLowerCase();
      if (d.name.indexOf(kw) === -1 && d.code.indexOf(kw) === -1) return false;
    }
    return true;
  }

  function applyFilters() {
    filtered = allCards.filter(passes);
    visible = 0;
    showNext();
    updateUI();
  }

  // ─── card visibility / pagination ─────────────────────────────────────────

  function showNext() {
    var next = Math.min(visible + CFG.STEP, filtered.length);
    for (var i = 0; i < allCards.length; i++)
      allCards[i].style.display = "none";
    for (var i = 0; i < next; i++) filtered[i].style.display = "block";
    visible = next;
    updateLoadMore();
  }

  function updateUI() {
    if (el.resultsCount) el.resultsCount.textContent = filtered.length;
    if (el.emptyState)
      el.emptyState.style.display = filtered.length === 0 ? "" : "none";
  }

  function injectBackToTop() {
    if (el.btnBackTop) return;
    var btt = document.createElement("button");
    btt.id = "btn-back-top";
    btt.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" style="margin-right:6px"><path d="M7 11V3M3 6l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to Top';
    btt.style.cssText =
      "display:none;align-items:center;justify-content:center;gap:6px;padding:12px 28px;border-radius:12px;border:1.5px solid #3a2e28;background:#fff;font-family:Inter,sans-serif;font-size:14px;font-weight:500;color:#3a2e28;cursor:pointer;transition:background 0.15s,color 0.15s;margin:16px auto 0;";
    btt.addEventListener("mouseenter", function () {
      btt.style.background = "#3a2e28";
      btt.style.color = "#fff";
    });
    btt.addEventListener("mouseleave", function () {
      btt.style.background = "#fff";
      btt.style.color = "#3a2e28";
    });
    btt.addEventListener("click", function () {
      var filterPanel = document.querySelector(".rent-filter_form-block");
      var target = filterPanel || document.body;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    if (el.btnLoadMore && el.btnLoadMore.parentNode) {
      el.btnLoadMore.parentNode.insertBefore(btt, el.btnLoadMore.nextSibling);
    } else if (el.grid && el.grid.parentNode) {
      el.grid.parentNode.appendChild(btt);
    }
    el.btnBackTop = btt;
  }

  function updateLoadMore() {
    injectBackToTop();
    if (!el.btnLoadMore) return;
    var rem = filtered.length - visible;
    if (rem <= 0) {
      el.btnLoadMore.style.display = "none";
      if (el.btnBackTop)
        el.btnBackTop.style.display = filtered.length > 0 ? "flex" : "none";
    } else {
      el.btnLoadMore.style.display = "";
      if (el.btnBackTop) el.btnBackTop.style.display = "none";
    }
  }

  // ─── currency ─────────────────────────────────────────────────────────────

  function setCurrency(currency) {
    var c = normCurrency(currency || "IDR");
    state.currency = c;
    if (el.currField) {
      var opts = el.currField.querySelectorAll(".filter-option");
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle("is-active", opts[i].dataset.value === c);
      }
      if (el.currTrigText) el.currTrigText.textContent = c;
    }
    if (
      window.debugCurrency &&
      typeof window.debugCurrency.setCurrency === "function"
    ) {
      window.debugCurrency.setCurrency(c);
    }
    updateSliderForCurrency(c);
    updateChips(c);
    setTimeout(function () {
      applyFilters();
    }, 80);
  }

  // ─── slider bounds ────────────────────────────────────────────────────────
  // Dynamically generated chips (calculated from CMS data, not presets)
  // Chips are created by dividing the price range into three equal tiers
  // Calculate prices in IDR, then convert to all currencies for display
  var dynamicChips = { IDR: [], USD: [], EUR: [] };
  
  function computeBaseBounds() {
    var lo = Infinity,
      hi = -Infinity;
    for (var i = 0; i < allCards.length; i++) {
      var d = getData(allCards[i]);
      if (!d.price || !isFinite(d.price)) continue;
      var idr = convertAmount(d.price, d.currency || "IDR", "IDR");
      // skip if conversion silently failed (returned raw value unchanged)
      if (d.currency !== "IDR" && idr === d.price) continue;
      if (idr < lo) lo = idr;
      if (idr > hi) hi = idr;
    }
    if (isFinite(lo) && isFinite(hi)) {
      slider.base = { min: lo, max: hi };
      generateDynamicChips(lo, hi);
    }
  }
  
  function generateDynamicChips(minPrice, maxPrice) {
    var range = maxPrice - minPrice;
    var tier1Max = minPrice + range / 3;
    var tier2Max = minPrice + (2 * range) / 3;
    
    var currencies = ['IDR', 'USD', 'EUR'];
    for (var c = 0; c < currencies.length; c++) {
      var curr = currencies[c];
      var min1 = convertAmount(minPrice, 'IDR', curr);
      var tier1 = convertAmount(tier1Max, 'IDR', curr);
      var tier2 = convertAmount(tier2Max, 'IDR', curr);
      var max1 = convertAmount(maxPrice, 'IDR', curr);
      
      dynamicChips[curr] = [
        { label: '< ' + short(tier1), min: 0, max: tier1 },
        { label: short(tier1) + ' \u2013 ' + short(tier2), min: tier1, max: tier2 },
        { label: '> ' + short(tier2), min: tier2, max: null }
      ];
    }
  }

  // ─── price slider ─────────────────────────────────────────────────────────

  function fixSliderDOM() {
    var sw = document.querySelector(".pw-slider");
    if (!sw) return;
    var track = sw.querySelector(".pw-track");
    var fill = document.getElementById("pwFill");
    var embed = sw.querySelector(".w-embed");
    if (track && fill && track.contains(fill)) {
      track.removeChild(fill);
      track.parentNode.insertBefore(fill, track.nextSibling);
    }
    if (fill) fill.innerHTML = "";
    if (embed) {
      embed.style.pointerEvents = "none";
      var inputs = embed.querySelectorAll("input[type=range]");
      for (var i = 0; i < inputs.length; i++)
        inputs[i].style.pointerEvents = "auto";
    }
    var minEl = document.getElementById("pwMin");
    var maxEl = document.getElementById("pwMax");
    if (minEl) minEl.value = minEl.min;
    if (maxEl) maxEl.value = maxEl.max;
  }

  // update slider display when currency changes — converts IDR base to selected currency
  function updateSliderForCurrency(currency) {
    var c = normCurrency(currency);
    var sym = symFor(c);
    var newMin = convertAmount(slider.base.min, "IDR", c);
    var newMax = convertAmount(slider.base.max, "IDR", c);
    slider.active = { min: newMin, max: newMax };
    var symMinEl = document.getElementById("pwSymbolMin");
    var symMaxEl = document.getElementById("pwSymbolMax");
    if (symMinEl) symMinEl.textContent = sym;
    if (symMaxEl) symMaxEl.textContent = sym;
    var scaleMin = document.getElementById("pwScaleMin");
    var scaleMax = document.getElementById("pwScaleMax");
    if (scaleMin) scaleMin.textContent = sym + short(newMin);
    if (scaleMax) scaleMax.textContent = sym + short(newMax);
    var fillEl = document.getElementById("pwFill");
    var sw = document.querySelector(".pw-slider");
    var tMin = sw ? sw.querySelector(".pw-thumb-min") : null;
    var tMax = sw ? sw.querySelector(".pw-thumb-max") : null;
    if (fillEl && sw) {
      var left = slider.minRatio * 100;
      var right = slider.maxRatio * 100;
      fillEl.style.left = left + "%";
      fillEl.style.width = right - left + "%";
      sw.style.setProperty("--thumb-min", left + "%");
      sw.style.setProperty("--thumb-max", right + "%");
      if (tMin) tMin.style.left = "calc(" + left + "% - 10px)";
      if (tMax) tMax.style.left = "calc(" + right + "% - 10px)";
    }
    var minV = newMin + slider.minRatio * (newMax - newMin);
    var maxV = newMin + slider.maxRatio * (newMax - newMin);
    var minT = document.getElementById("pwMinText");
    var maxT = document.getElementById("pwMaxText");
    if (minT)
      minT.value = Number(minV).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
    if (maxT)
      maxT.value = Number(maxV).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      });
    state.priceMin = minV;
    state.priceMax = maxV;
    var rangeText = document.getElementById("pwRangeText");
    if (rangeText)
      rangeText.textContent =
        sym + short(minV) + " \u2013 " + sym + short(maxV);
    if (el.priceTrigText) {
      var full = slider.minRatio <= 0 && slider.maxRatio >= 1;
      el.priceTrigText.textContent = full
        ? "Price Range"
        : sym + short(minV) + " \u2013 " + sym + short(maxV);
    }
  }

  // update quick-select chip labels for selected currency using dynamically generated chips
  function updateChips(currency) {
    var c = normCurrency(currency);
    var presets = dynamicChips[c] && dynamicChips[c].length > 0 ? dynamicChips[c] : CHIP_PRESETS[c] || CHIP_PRESETS["IDR"];
    var chips = document.querySelectorAll(".pw-chip");
    for (var i = 0; i < chips.length; i++) {
      var p = presets[i];
      if (!p) continue;
      chips[i].dataset.min = String(p.min);
      chips[i].dataset.max = String(p.max !== null ? p.max : slider.active.max);
      chips[i].textContent = p.label;
    }
  }

  function initPricePanel() {
    if (!el.priceTrigger || !el.priceDropdown) return;
    fixSliderDOM();

    var nativeMin = document.getElementById("pwMin");
    var nativeMax = document.getElementById("pwMax");
    var fillEl = document.getElementById("pwFill");
    var minText = document.getElementById("pwMinText");
    var maxText = document.getElementById("pwMaxText");
    var chips = document.querySelectorAll(".pw-chip");
    var sw = document.querySelector(".pw-slider");
    if (!fillEl || !sw) return;

    slider.minRatio = 0;
    slider.maxRatio = 1;

    function ratioToVal(r) {
      return slider.active.min + r * (slider.active.max - slider.active.min);
    }
    function valToRatio(v) {
      var range = slider.active.max - slider.active.min || 1;
      return (v - slider.active.min) / range;
    }
    function clamp(v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    }
    function fmt(n) {
      return Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
    }

    function render() {
      var sym = symFor(state.currency);
      var left = slider.minRatio * 100;
      var right = slider.maxRatio * 100;
      fillEl.style.left = left + "%";
      fillEl.style.width = right - left + "%";
      sw.style.setProperty("--thumb-min", left + "%");
      sw.style.setProperty("--thumb-max", right + "%");
      var minV = ratioToVal(slider.minRatio);
      var maxV = ratioToVal(slider.maxRatio);
      state.priceMin = minV;
      state.priceMax = maxV;
      if (minText) minText.value = fmt(minV);
      if (maxText) maxText.value = fmt(maxV);
      var rangeText = document.getElementById("pwRangeText");
      if (rangeText)
        rangeText.textContent =
          sym + short(minV) + " \u2013 " + sym + short(maxV);
      if (el.priceTrigText) {
        var full = slider.minRatio <= 0 && slider.maxRatio >= 1;
        el.priceTrigText.textContent = full
          ? "Price Range"
          : sym + short(minV) + " \u2013 " + sym + short(maxV);
      }
      if (nativeMin) nativeMin.value = String(minV);
      if (nativeMax) nativeMax.value = String(maxV);
      var scaleMin = document.getElementById("pwScaleMin");
      var scaleMax = document.getElementById("pwScaleMax");
      if (scaleMin) scaleMin.textContent = sym + short(minV);
      if (scaleMax) scaleMax.textContent = sym + short(maxV);
      for (var i = 0; i < chips.length; i++) {
        var cMin = Number(chips[i].dataset.min);
        var cMax = Number(chips[i].dataset.max);
        chips[i].classList.toggle(
          "is-active",
          Math.abs(cMin - minV) < 1000 && Math.abs(cMax - maxV) < 1000,
        );
      }
    }

    var THUMB_SIZE = 20,
      dragging = null;

    function getRatio(clientX) {
      var rect = sw.getBoundingClientRect();
      var half = THUMB_SIZE / 2;
      var width = rect.width - THUMB_SIZE;
      return clamp((clientX - rect.left - half) / width, 0, 1);
    }

    var dragTimer = null;
    function onMove(clientX) {
      if (!dragging) return;
      var r = getRatio(clientX);
      if (dragging === "min") slider.minRatio = clamp(r, 0, slider.maxRatio);
      else slider.maxRatio = clamp(r, slider.minRatio, 1);
      fullRender();
      clearTimeout(dragTimer);
      dragTimer = setTimeout(applyFilters, 40);
    }
    function onUp() {
      dragging = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onUp);
      applyFilters();
    }
    function onMouseMove(e) {
      onMove(e.clientX);
    }
    function onTouchMove(e) {
      e.preventDefault();
      onMove(e.touches[0].clientX);
    }

    // hide native Webflow embed, use custom thumbs instead
    var embed = sw.querySelector(".w-embed,.code-embed-6");
    if (embed) embed.style.display = "none";

    var thumbMin = sw.querySelector(".pw-thumb-min");
    if (!thumbMin) {
      thumbMin = document.createElement("div");
      thumbMin.className = "pw-thumb pw-thumb-min";
      sw.appendChild(thumbMin);
    }
    var thumbMax = sw.querySelector(".pw-thumb-max");
    if (!thumbMax) {
      thumbMax = document.createElement("div");
      thumbMax.className = "pw-thumb pw-thumb-max";
      sw.appendChild(thumbMax);
    }

    function positionThumbs() {
      var left = slider.minRatio * 100;
      var right = slider.maxRatio * 100;
      thumbMin.style.left = "calc(" + left + "% - " + THUMB_SIZE / 2 + "px)";
      thumbMax.style.left = "calc(" + right + "% - " + THUMB_SIZE / 2 + "px)";
    }
    function fullRender() {
      render();
      positionThumbs();
    }

    function startDrag(which, e) {
      dragging = which;
      e.preventDefault();
      if (e.type === "mousedown") {
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onUp);
      } else {
        document.addEventListener("touchmove", onTouchMove, { passive: false });
        document.addEventListener("touchend", onUp);
      }
    }

    thumbMin.addEventListener("mousedown", function (e) {
      startDrag("min", e);
    });
    thumbMin.addEventListener(
      "touchstart",
      function (e) {
        startDrag("min", e);
      },
      { passive: false },
    );
    thumbMax.addEventListener("mousedown", function (e) {
      startDrag("max", e);
    });
    thumbMax.addEventListener(
      "touchstart",
      function (e) {
        startDrag("max", e);
      },
      { passive: false },
    );

    var trackEl = sw.querySelector(".pw-track");
    if (trackEl) {
      trackEl.style.pointerEvents = "auto";
      trackEl.style.cursor = "pointer";
      trackEl.addEventListener("mousedown", function (e) {
        var r = getRatio(e.clientX);
        var mid = (slider.minRatio + slider.maxRatio) / 2;
        dragging = r <= mid ? "min" : "max";
        onMove(e.clientX);
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onUp);
      });
    }

    function bindTextInput(inputEl, which) {
      if (!inputEl || inputEl.tagName !== "INPUT") return;
      inputEl.addEventListener("change", function () {
        var v = parseInt(String(inputEl.value).replace(/[^0-9]/g, ""), 10);
        if (isNaN(v)) return;
        v = clamp(v, slider.active.min, slider.active.max);
        if (which === "min")
          slider.minRatio = valToRatio(
            Math.min(v, ratioToVal(slider.maxRatio)),
          );
        else
          slider.maxRatio = valToRatio(
            Math.max(v, ratioToVal(slider.minRatio)),
          );
        fullRender();
        applyFilters();
      });
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter") inputEl.dispatchEvent(new Event("change"));
      });
    }
    bindTextInput(minText, "min");
    bindTextInput(maxText, "max");

    // quick-select chips
    for (var i = 0; i < chips.length; i++) {
      (function (ch) {
        ch.addEventListener("click", function () {
          var cMin = Number(ch.dataset.min);
          var cMax = Number(ch.dataset.max);
          slider.minRatio = valToRatio(
            clamp(cMin, slider.active.min, slider.active.max),
          );
          slider.maxRatio = valToRatio(
            clamp(cMax, slider.active.min, slider.active.max),
          );
          fullRender();
          applyFilters();
        });
      })(chips[i]);
    }

    // inject scale labels below slider
    var scaleEl = document.querySelector(".pw-scale");
    if (!scaleEl) {
      scaleEl = document.createElement("div");
      scaleEl.className = "pw-scale";
      var sMin = document.createElement("span");
      sMin.id = "pwScaleMin";
      sMin.className = "pw-scale-min";
      var sMax = document.createElement("span");
      sMax.id = "pwScaleMax";
      sMax.className = "pw-scale-max";
      scaleEl.appendChild(sMin);
      scaleEl.appendChild(sMax);
      sw.parentNode.insertBefore(scaleEl, sw.nextSibling);
    }

    slider.active = { min: slider.base.min, max: slider.base.max };
    updateChips(state.currency);
    fullRender();
  }

  // ─── location UI ──────────────────────────────────────────────────────────

function buildAreas() {
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LOCATION FILTER: Fully CMS-driven
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // This function scans all CMS cards and builds location groups dynamically.
  // Only locations that exist in CMS data are displayed in the filter.
  //
  // Workflow:
  //   1. Scan all cards for data-location attributes
  //   2. Normalize location names (lowercase, trim, normalize spacing)
  //   3. Keep mapping of normalized → original labels
  //   4. Match normalized locations to predefined AREA_RULES
  //   5. Group locations into areas
  //   6. Create "Other area" for unmatched locations
  //   7. Filter state.locations to keep only CMS locations
  //
  // Result:
  //   - Locations automatically update when CMS changes
  //   - Only shows locations that exist in listings
  //   - No hardcoded location lists
  //   - Map coordinates still work via LOC_COORDS lookup
  //
  
  var locSet = {};

  // collect unique locations from CMS cards
  for (var i = 0; i < allCards.length; i++) {
    var d = getData(allCards[i]);
    if (!d.loc) continue;

    locSet[d.loc] = true;

    // keep original label for display (e.g., "Batu Bolong" instead of "batu bolong")
    if (!labelByNorm[d.loc]) {
      labelByNorm[d.loc] = d.locRaw;
    }
  }

  var cmsLocs = Object.keys(locSet);
  var used = {};
  areas = [];

  // match locations to defined AREA_RULES
  // uses exact match (not partial) to avoid false matches
  for (var a = 0; a < AREA_RULES.length; a++) {
    var rule = AREA_RULES[a];

    var children = cmsLocs.filter(function (loc) {
      var hit = rule.keys.indexOf(loc) > -1;
      if (hit) used[loc] = true;
      return hit;
    });

    if (children.length) {
      areas.push({
        id: rule.id,
        label: rule.label,
        children: children
      });
    }
  }

  // detect locations not assigned to any area
  var other = cmsLocs.filter(function (loc) {
    return !used[loc];
  });

  // only create "Other area" if needed
  if (other.length) {
    areas.push({
      id: "other-area",
      label: "Other area",
      children: other
    });
  }

  // keep only valid selected locations (filter out locations no longer in CMS)
  state.locations = state.locations.filter(function (loc) {
    return locSet[loc];
  });
}

  function buildLocDOM() {
    if (!el.locDropdown) return;
    var treeScroll = el.locDropdown.querySelector(".tree-scroll");
    var pillScroll = el.locDropdown.querySelector(".pill-scroll");
    if (!treeScroll || !pillScroll) return;

    treeScroll.innerHTML = "";
    pillScroll.innerHTML = "";

    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];

      // pill
      var pill = document.createElement("div");
      pill.className = "pill";
      pill.dataset.areaId = area.id;
      pill.textContent = area.label;
      pillScroll.appendChild(pill);

      // tree item
      var treeItem = document.createElement("div");
      treeItem.className = "tree-item";
      treeItem.dataset.areaId = area.id;

      var treeParent = document.createElement("div");
      treeParent.className = "tree-parent";

      var chevron = document.createElement("div");
      chevron.className = "tree-chevron";

      var parentName = document.createElement("div");
      parentName.className = "parent-name";
      parentName.textContent = area.label;

      treeParent.appendChild(chevron);
      treeParent.appendChild(parentName);

      var childrenWrap = document.createElement("div");
      childrenWrap.className = "children";

      var childrenInner = document.createElement("div");
      childrenInner.className = "children-inner";

      var branch = document.createElement("div");
      branch.className = "branch";

      var childList = document.createElement("div");
      childList.className = "child-list";

      for (var k = 0; k < area.children.length; k++) {
        var loc = area.children[k];
        var label = labelByNorm[loc] || (loc.charAt(0).toUpperCase() + loc.slice(1));

        var childEl = document.createElement("div");
        childEl.className = "child";
        childEl.dataset.location = loc;

        var miniPin = document.createElement("div");
        miniPin.className = "mini-pin";

        var span = document.createElement("span");
        span.textContent = label;

        childEl.appendChild(miniPin);
        childEl.appendChild(span);
        childList.appendChild(childEl);
      }

      childrenInner.appendChild(branch);
      childrenInner.appendChild(childList);
      childrenWrap.appendChild(childrenInner);
      treeItem.appendChild(treeParent);
      treeItem.appendChild(childrenWrap);
      treeScroll.appendChild(treeItem);
    }
  }

  function mountLocUI() {
    if (!el.locDropdown) return;
    locUI = {
      searchInput: el.locDropdown.querySelector(".location-search-input"),
      treeScroll:  el.locDropdown.querySelector(".tree-scroll"),
      pillScroll:  el.locDropdown.querySelector(".pill-scroll"),
      selectedInfo: el.locDropdown.querySelector("#locSelectedInfo"),
      btnClear: el.locDropdown.querySelector(".loc-btn-clear-inline"),
      btnApply: el.locDropdown.querySelector(".loc-btn-apply-inline"),
    };
    if (!locUI.searchInput || !locUI.treeScroll || !locUI.pillScroll) return;

    // ── Tree parents: expand/collapse ──
    var treeParents = locUI.treeScroll.querySelectorAll('.tree-parent');
    for (var i = 0; i < treeParents.length; i++) {
      var parent = treeParents[i];
      var children = parent.parentNode.querySelector('.children');
      if (children) {
        parent.addEventListener('click', (function(cw) {
          return function() { cw.classList.toggle('open'); };
        })(children));
      }
    }

    // ── Tree children: individual location toggle ──
    var children = locUI.treeScroll.querySelectorAll('.child');
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      var loc = child.dataset.location;
      if (loc) {
        child.addEventListener('click', (function(l) {
          return function(e) {
            e.stopPropagation();
            toggleLoc(l);
          };
        })(loc));
      }
    }

    // ── Pills: area toggle ──
    var pills = locUI.pillScroll.querySelectorAll('.pill');
    for (var i = 0; i < pills.length; i++) {
      var pill = pills[i];
      var areaId = pill.dataset.areaId;
      if (areaId) {
        pill.addEventListener('click', (function(aId) {
          return function() { toggleArea(aId); };
        })(areaId));
      }
    }

    // ── Tab switching ──
    var tabAreaBtn  = el.locDropdown.querySelector('.loc-tab-area');
    var tabMapsBtn  = el.locDropdown.querySelector('.loc-tab-maps');
    var panelArea   = el.locDropdown.querySelector('.loc-panel-area');
    var panelMaps   = el.locDropdown.querySelector('.loc-panel-maps');
    function switchLocTab(toMaps) {
      if (toMaps) {
        if (tabAreaBtn) tabAreaBtn.classList.remove('is-active');
        if (tabMapsBtn) tabMapsBtn.classList.add('is-active');
        if (panelArea)  panelArea.classList.remove('is-active');
        if (panelMaps)  panelMaps.classList.add('is-active');
        setTimeout(function() { if (locMap) locMap.resize(); }, 50);
      } else {
        if (tabMapsBtn) tabMapsBtn.classList.remove('is-active');
        if (tabAreaBtn) tabAreaBtn.classList.add('is-active');
        if (panelMaps)  panelMaps.classList.remove('is-active');
        if (panelArea)  panelArea.classList.add('is-active');
      }
    }
    if (tabAreaBtn) tabAreaBtn.addEventListener('click', function() { switchLocTab(false); });
    if (tabMapsBtn) tabMapsBtn.addEventListener('click', function() { switchLocTab(true); });

    locUI.searchInput.addEventListener("input", renderLocLists);
    if (locUI.btnClear) {
      locUI.btnClear.addEventListener("click", function () {
        draftLocs = [];
        renderLocLists();
        syncMapWith(draftLocs);
        syncLocMapMarkers(draftLocs);
        updateDraftInfo();
      });
    }
    if (locUI.btnApply) {
      locUI.btnApply.addEventListener("click", function () {
        commitDraft();
        openLocDrop(false);
      });
    }
  }

  function renderLocLists() {
    // Update location filter UI based on search and selection
    // Assumes UI elements are already in DOM from Webflow
    //
    if (!locUI.treeScroll || !locUI.pillScroll) return;
    var q = norm(locUI.searchInput ? locUI.searchInput.value : "");
    var openAreas = {};
    var treeItems = locUI.treeScroll.querySelectorAll(".tree-item");
    for (var x = 0; x < treeItems.length; x++) {
      var pName = treeItems[x].querySelector(".parent-name");
      var cw = treeItems[x].querySelector(".children");
      if (pName && cw && cw.classList.contains("open"))
        openAreas[pName.textContent.trim()] = true;
    }
    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];
      var areaHit = !q || norm(area.label).indexOf(q) > -1;
      var visKids = area.children.filter(function (c) {
        return areaHit || norm(c).indexOf(q) > -1;
      });
      var areaActive = area.children.some(function (c) {
        return draftLocs.indexOf(c) > -1;
      });
      // Update pill
      var pill = locUI.pillScroll.querySelector('.pill[data-area-id="' + area.id + '"]');
      if (pill) {
        pill.classList.toggle('is-active', areaActive);
        pill.style.display = visKids.length || areaHit ? '' : 'none';
      }
      // Update tree item
      var treeItem = locUI.treeScroll.querySelector('.tree-item[data-area-id="' + area.id + '"]');
      if (treeItem) {
        var parent = treeItem.querySelector('.tree-parent');
        if (parent) {
          parent.classList.toggle('is-active', areaActive);
        }
        var children = treeItem.querySelector('.children');
        if (children) {
          var isOpen = openAreas[area.label] || areaActive;
          children.classList.toggle('open', isOpen);
        }
        treeItem.style.display = visKids.length || areaHit ? '' : 'none';
        // Update children
        var childElements = treeItem.querySelectorAll('.child');
        for (var k = 0; k < childElements.length; k++) {
          var childEl = childElements[k];
          var loc = childEl.dataset.location;
          if (loc) {
            var isActive = draftLocs.indexOf(loc) > -1;
            childEl.classList.toggle('is-active', isActive);
            childEl.style.display = visKids.indexOf(loc) > -1 ? '' : 'none';
          }
        }
      }
    }
    updateDraftInfo();
  }

  function toggleLoc(loc) {
    var idx = draftLocs.indexOf(loc);
    if (idx > -1) draftLocs.splice(idx, 1);
    else draftLocs.push(loc);
    renderLocLists();
    syncMapWith(draftLocs);
    syncLocMapMarkers(draftLocs);
  }

  function toggleArea(areaId) {
    var area = null;
    for (var i = 0; i < areas.length; i++) {
      if (areas[i].id === areaId) {
        area = areas[i];
        break;
      }
    }
    if (!area) return;
    var allOn = area.children.every(function (c) {
      return draftLocs.indexOf(c) > -1;
    });
    if (allOn) {
      draftLocs = draftLocs.filter(function (l) {
        return area.children.indexOf(l) === -1;
      });
    } else {
      for (var i = 0; i < area.children.length; i++) {
        if (draftLocs.indexOf(area.children[i]) === -1)
          draftLocs.push(area.children[i]);
      }
    }
    renderLocLists();
    syncMapWith(draftLocs);
    syncLocMapMarkers(draftLocs);
  }

  function updateDraftInfo() {
    if (!locUI.selectedInfo) return;
    var n = draftLocs.length;
    if (n === 0) locUI.selectedInfo.textContent = "No location selected";
    else if (n === 1)
      locUI.selectedInfo.textContent =
        "Selected: " + (labelByNorm[draftLocs[0]] || draftLocs[0]);
    else locUI.selectedInfo.textContent = "Selected: " + n + " locations";
  }

  function updateLocText() {
    if (!el.locTrigText) return;
    var n = state.locations.length;
    if (n === 0) el.locTrigText.textContent = "All Location";
    else if (n === 1)
      el.locTrigText.textContent =
        labelByNorm[state.locations[0]] || state.locations[0];
    else el.locTrigText.textContent = n + " locations";
  }

  function commitDraft() {
    state.locations = draftLocs.slice();
    updateLocText();
    syncMapWith(state.locations);
    applyFilters();
  }

  function openLocDrop(force) {
    locDropOpen = force !== undefined ? force : !locDropOpen;
    if (!el.locDropdown) return;
    if (locDropOpen) {
      draftLocs = state.locations.slice();
      if (locUI.searchInput) locUI.searchInput.value = "";
      renderLocLists();
      syncMapWith(draftLocs);
      syncLocMapMarkers(draftLocs);
    }
    el.locDropdown.style.display = locDropOpen ? "block" : "none";
    el.locDropdown.classList.toggle("is-open", locDropOpen);
    if (locDropOpen) {
      if (map) setTimeout(function () { map.resize(); }, 80);
      if (locMap) setTimeout(function () { locMap.resize(); }, 80);
    }
    if (!locDropOpen) syncMapWith(state.locations);
  }

  // ─── map ──────────────────────────────────────────────────────────────────

  function loadMapSDK(cb) {
    if (window.maptilersdk) return cb();
    if (!document.querySelector("link[data-mt-css]")) {
      var css = document.createElement("link");
      css.rel = "stylesheet";
      css.href =
        "https://cdn.maptiler.com/maptiler-sdk-js/v3.10.2/maptiler-sdk.css";
      css.setAttribute("data-mt-css", "1");
      document.head.appendChild(css);
    }
    var ex = document.querySelector("script[data-mt-js]");
    if (ex) return ex.addEventListener("load", cb, { once: true });
    var js = document.createElement("script");
    js.src =
      "https://cdn.maptiler.com/maptiler-sdk-js/v3.10.2/maptiler-sdk.umd.min.js";
    js.async = true;
    js.setAttribute("data-mt-js", "1");
    js.onload = cb;
    document.head.appendChild(js);
  }

  function initMap() {
    if (map) return;
    var mapEl = document.getElementById("bhbMap");
    if (!mapEl || !window.maptilersdk) return;
    maptilersdk.config.apiKey = MAPTILER_KEY;
    map = new maptilersdk.Map({
      container: "bhbMap",
      style: MAP_STYLE,
      center: [115.1889, -8.4095],
      zoom: 9.3,
    });
    map.on("load", function () {
      mapReady = true;
      syncMapWith(state.locations);
      setTimeout(function () {
        map.resize();
      }, 80);
    });
  }

  function initLocMap() {
    if (locMap) return;
    var mapEl = document.getElementById('locMapEl');
    if (!mapEl || !window.maptilersdk) return;
    maptilersdk.config.apiKey = MAPTILER_KEY;
    locMap = new maptilersdk.Map({
      container: 'locMapEl',
      style: MAP_STYLE,
      center: [115.1889, -8.4095],
      zoom: 9.3,
      attributionControl: false,
    });
    locMap.on('load', function () {
      locMapReady = true;
      syncLocMapMarkers(draftLocs);
      setTimeout(function () { locMap.resize(); }, 80);
    });
  }

  function syncLocMapMarkers(locations) {
    if (!locMap || !locMapReady) return;
    for (var i = 0; i < locMapMarkers.length; i++) locMapMarkers[i].remove();
    locMapMarkers = [];
    var pts = [], seen = {};
    for (var i = 0; i < locations.length; i++) {
      var p = LOC_COORDS[locations[i]];
      if (!p) continue;
      var key = p[0] + ',' + p[1];
      if (!seen[key]) {
        seen[key] = true;
        pts.push({ p: p, loc: locations[i] });
      }
    }
    if (!pts.length) {
      locMap.flyTo({ center: [115.1889, -8.4095], zoom: 9.3, duration: 450 });
      return;
    }
    for (var i = 0; i < pts.length; i++) {
      var label = (labelByNorm[pts[i].loc] || pts[i].loc).replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      locMapMarkers.push(
        new maptilersdk.Marker({ element: makePin(label), anchor: 'bottom' })
          .setLngLat(pts[i].p)
          .addTo(locMap)
      );
    }
    if (pts.length === 1) {
      locMap.flyTo({ center: pts[0].p, zoom: 12.2, duration: 450 });
      return;
    }
    var bounds = new maptilersdk.LngLatBounds();
    for (var i = 0; i < pts.length; i++) bounds.extend(pts[i].p);
    locMap.fitBounds(bounds, { padding: 60, maxZoom: 13, duration: 450 });
  }

  function clearMarkers() {
    for (var i = 0; i < markers.length; i++) markers[i].remove();
    markers = [];
  }

  function makePin(label) {
    var wrap = document.createElement("div");
    wrap.className = "map-marker-wrap";
    var img = document.createElement("img");
    img.src = PIN_URL;
    img.alt = "marker";
    img.style.cssText =
      "width:26px;height:26px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.25))";
    var txt = document.createElement("div");
    txt.className = "map-marker-label";
    txt.textContent = label;
    wrap.appendChild(img);
    wrap.appendChild(txt);
    return wrap;
  }

  function syncMap() {
    syncMapWith(state.locations);
  }

  function syncSvgMap(locations) {
    if (!el.locDropdown) return;
    var svgEl = el.locDropdown.querySelector('.bali-svg-map');
    if (!svgEl) return;
    var activeAreaIds = {};
    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];
      var hasActive = false;
      for (var k = 0; k < area.children.length; k++) {
        if (locations.indexOf(area.children[k]) > -1) { hasActive = true; break; }
      }
      if (hasActive) activeAreaIds[area.id] = true;
    }
    var regionPaths = svgEl.querySelectorAll('.bali-area-region');
    for (var i = 0; i < regionPaths.length; i++) {
      var path = regionPaths[i];
      var areaId = path.getAttribute('data-area');
      path.classList.toggle('is-active', !!activeAreaIds[areaId]);
    }
    // update individual location dots
    var dots = svgEl.querySelectorAll('.loc-dot');
    for (var i = 0; i < dots.length; i++) {
      var dot = dots[i];
      dot.classList.toggle('is-active', locations.indexOf(dot.getAttribute('data-location')) > -1);
    }
  }

  // ─── geo → SVG coordinate projection ─────────────────────────────────────
  // Linear transform calibrated from Bali SVG (323×436 viewBox).
  // Reference anchors: Canggu [115.1365, -8.65062] → (132, 215)
  //                    Ubud   [115.2623, -8.5069]  → (235, 100)
  function geoToSvg(lng, lat) {
    var x = (lng - 115.1365) * 819 + 132;
    var y = (-8.65062 - lat) * 800 + 215;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }

  // ─── build location dots on SVG ───────────────────────────────────────────
  function buildMapDots() {
    if (!el.locDropdown) return;
    var svgEl = el.locDropdown.querySelector('.bali-svg-map');
    if (!svgEl) return;
    var NS = 'http://www.w3.org/2000/svg';
    // remove any old dots
    var old = svgEl.querySelectorAll('.loc-dot, .loc-dot-label');
    for (var i = 0; i < old.length; i++) old[i].remove();
    // add a dot + label per location
    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];
      for (var k = 0; k < area.children.length; k++) {
        var loc = area.children[k];
        var coords = LOC_COORDS[loc];
        if (!coords) continue;
        var pos = geoToSvg(coords[0], coords[1]);
        var circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', pos.x);
        circle.setAttribute('cy', pos.y);
        circle.setAttribute('r', '5');
        circle.setAttribute('class', 'loc-dot');
        circle.setAttribute('data-location', loc);
        circle.setAttribute('data-area', area.id);
        (function(l) {
          circle.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleLoc(l);
          });
        })(loc);
        svgEl.appendChild(circle);
        var lbl = labelByNorm[loc] || (loc.charAt(0).toUpperCase() + loc.slice(1));
        var text = document.createElementNS(NS, 'text');
        text.setAttribute('x', pos.x + 7);
        text.setAttribute('y', pos.y + 4);
        text.setAttribute('class', 'loc-dot-label');
        text.setAttribute('data-location', loc);
        text.setAttribute('pointer-events', 'none');
        text.textContent = lbl;
        svgEl.appendChild(text);
      }
    }
  }

  function syncMapWith(locations) {
    if (!map || !mapReady) return;
    clearMarkers();
    var pts = [],
      seen = {};
    for (var i = 0; i < locations.length; i++) {
      var p = LOC_COORDS[locations[i]];
      if (!p) continue;
      var key = p[0] + "," + p[1];
      if (!seen[key]) {
        seen[key] = true;
        pts.push({ p: p, loc: locations[i] });
      }
    }
    if (!pts.length) {
      map.flyTo({ center: [115.1889, -8.4095], zoom: 9.3, duration: 450 });
      return;
    }
    for (var i = 0; i < pts.length; i++) {
      var label = (labelByNorm[pts[i].loc] || pts[i].loc).replace(
        /\b\w/g,
        function (c) {
          return c.toUpperCase();
        },
      );
      markers.push(
        new maptilersdk.Marker({ element: makePin(label), anchor: "bottom" })
          .setLngLat(pts[i].p)
          .addTo(map),
      );
    }
    if (pts.length === 1) {
      map.flyTo({ center: pts[0].p, zoom: 12.2, duration: 450 });
      return;
    }
    var bounds = new maptilersdk.LngLatBounds();
    for (var i = 0; i < pts.length; i++) bounds.extend(pts[i].p);
    map.fitBounds(bounds, {
      padding: { top: 40, right: 40, bottom: 40, left: 40 },
      maxZoom: 12,
      duration: 450,
    });
  }

  // ─── CMS coordinate hydration ─────────────────────────────────────────────

  function hydrateCoordsFromCMS() {
    var nodes = document.querySelectorAll(".location-hidden-embed");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var name = norm(
        node.dataset.name || node.getAttribute("data-name") || "",
      );
      var raw =
        node.dataset.mapEmbed ||
        node.getAttribute("data-map-embed") ||
        node.innerHTML ||
        "";
      var pair = extractLatLng(raw);
      if (name && pair) LOC_COORDS[name] = pair;
    }
  }

  function decodeEntities(s) {
    return String(s || "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#x3D;|&#61;/g, "=")
      .replace(/&#x2F;|&#47;/g, "/");
  }

  function extractLatLng(embed) {
    var s = decodeEntities(embed),
      m;
    m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
    if (m) return [parseFloat(m[2]), parseFloat(m[1])];
    m = s.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),[\d.]+z/);
    if (m) return [parseFloat(m[2]), parseFloat(m[1])];
    m = s.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) return [parseFloat(m[2]), parseFloat(m[1])];
    return null;
  }

  // ─── UI builder ───────────────────────────────────────────────────────────
  // Creates entire filter HTML and injects into #bhb-filter.
  // Replaces the native Webflow filter form elements.

  function buildUI() {
    var root = document.getElementById('bhb-filter');
    if (!root) return;

    var CLOSE_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    var CHEVRON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

var BALI_SVG = ''
    + '<svg width="323" height="436" viewBox="0 0 323 436" fill="none" xmlns="http://www.w3.org/2000/svg" class="bali-svg-map">'
    + '<path class="bali-outline" d="M323 157.992L322.245 158.706L318.798 166.451L318.76 166.538L318.674 166.577L311.132 170.031L308.335 172.177L308.319 172.189L308.302 172.198L299.487 176.931L294.764 184.664L294.731 184.718L294.677 184.75L278.096 194.438L277.255 197.163L277.235 197.226L277.188 197.271L262.472 211.338L262.459 211.351L262.444 211.36L245.813 223.234L239.815 231.801L239.609 235.141L243.046 243.088L243.075 243.157L242.209 248.149L245.002 256.966L245.021 257.025L242.849 268.559L242.836 268.623L242.795 268.673L239.549 272.567L239.514 272.61L239.464 272.634L231.674 276.314L231.623 276.339H228.754L228.53 274.808L224.532 274.61L220.932 278.638L220.9 278.673L220.859 278.693L213.283 282.589L213.233 282.614L213.179 282.616L207.877 282.825L205.51 285.785L208.344 288.013L208.532 288.16L207.308 289.866L207.17 290.06L206.97 289.932L204.054 288.053L200.92 289.304L200.875 289.322H196.91L195.013 296.498L194.979 296.623L194.858 296.668L192.07 297.712L195.495 298.792L195.67 298.848V301.231L195.658 301.269L193.651 307.515L193.46 307.506L188.916 307.284L188.647 307.271L189.521 300.038L187.967 299.265L187.207 299.07L183.469 300.412L180.943 303.368L179.973 305.888L179.625 312.779L180.943 321.032L184.154 327.454L189.963 333.263L194.508 337.593L194.547 337.631L194.567 337.682L196.301 342.012L196.325 342.071L196.317 342.135L196.131 343.634L200.111 344.503L198.268 342.487L198.229 342.445L198.213 342.392L195.616 333.953L195.562 333.779L195.711 333.675L199.22 331.193L196.899 325.695L197.332 320.22L197.335 320.182L197.35 320.146L198.189 318.057L197.56 315.315L197.532 315.198L197.607 315.104L199.333 312.942L199.414 312.842L199.543 312.849L203.41 313.073L203.453 313.255L205.187 320.617L205.193 320.644V320.67L205.406 331.677L208.405 344.094L210.983 345.384L214.63 354.608L217.042 354.403L217.254 354.386L217.307 354.592L217.741 356.325L217.769 356.433L217.707 356.525L217.022 357.545L220.17 358.53L220.346 358.585V361.442L216.483 360.761L212.963 363.661L212.116 368.337L212.102 368.417L212.043 368.474L207.091 373.204L204.512 377.719L199.975 387.014L199.933 387.102L199.842 387.137L187.755 391.881C187.747 391.887 187.738 391.895 187.728 391.903C187.691 391.932 187.637 391.975 187.567 392.028C187.429 392.136 187.229 392.29 186.986 392.475C186.502 392.845 185.843 393.34 185.151 393.843C184.46 394.345 183.731 394.856 183.105 395.256C182.793 395.456 182.503 395.63 182.255 395.762C182.013 395.89 181.789 395.99 181.614 396.024C181.072 396.131 179.178 396.509 177.42 396.86C176.541 397.036 175.696 397.205 175.07 397.33C174.758 397.393 174.5 397.444 174.32 397.479C174.231 397.497 174.16 397.512 174.112 397.521C174.088 397.526 174.07 397.53 174.058 397.532H174.055L163.687 401.208L163.659 401.218L163.63 401.221L151.51 402.519L151.489 402.521L151.469 402.52L136.53 401.657L115.978 401.008H115.966L115.955 401.006L101.887 399.272L101.861 399.27L101.837 399.261L79.7578 391.685L79.6201 391.638L79.5928 391.495L78.7373 386.994L76.8135 383.787L76.7715 383.717L76.7793 383.636L77.4287 376.495L77.4336 376.438L81.5713 369.463L81.6406 369.346L81.7783 369.341L88.6152 369.121L92.2285 365.936L92.3213 365.854L92.4434 365.878L95.5889 366.507L100.482 363.317L100.486 363.315L106.237 359.69L107.736 352.008L107.751 351.934L107.805 351.879L109.53 350.146L109.647 350.028L110.748 350.471L114.094 347.753L114.152 347.705L114.228 347.698L120.793 347.062L122.033 344.167L122.086 344.045L122.217 344.021L125.589 343.387L130.298 337.826L130.372 337.738H137.437L137.458 337.741L143.735 338.826L143.742 338.827L147.933 339.664L151.479 336.117L154.265 327.985L154.476 319.237L151.519 315.438L145.769 310.966H139.823L138.908 307.752L138.824 307.454L139.133 307.435L145.445 307.019L147.561 299.18L147.562 299.172L149.731 292.031L149.743 291.993L154.675 284.909L152.327 274.213L147.369 261.925L140.674 252.859L140.666 252.849L133.529 242.034L126.193 233.191L113.442 222.599L105.029 215.7L91.9902 209.826L91.9521 209.739L88.5078 202.002L84.4434 198.579L84.4111 198.552L84.3896 198.517L76.5996 185.525L76.5693 185.474L76.5645 185.414L76.1377 179.256L73.5029 177.433L72.0859 177.641L71.9365 177.662L64.2881 167.168L46.5596 151.392L26.8799 134.736L14.7744 126.954L14.7578 126.943L14.7432 126.931L5.03711 118.303L0 116.323V0H323V157.992Z" fill="#E8E4E0" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-seminyak" d="M149.243 235.24C148.862 234.908 148.346 234.563 147.751 234.544C147.445 234.534 147.096 234.589 146.725 234.661C146.33 234.738 145.936 234.828 145.435 234.921C144.835 235.032 144.284 235.171 143.798 235.296C143.305 235.422 142.892 235.531 142.541 235.591C142.176 235.653 141.709 235.782 141.193 235.921C140.669 236.062 140.074 236.218 139.425 236.348C139.001 236.432 138.593 236.529 138.091 236.643C137.586 236.757 136.977 236.89 136.141 237.055C134.925 237.294 133.057 237.665 131.92 237.786C131.365 237.846 130.708 237.854 130.049 237.839L133.529 242.034L140.666 252.849L140.674 252.86L147.369 261.925L149.691 267.68C152.899 265.514 161.109 266.648 164.813 267.486C164.975 267.143 165.264 266.733 165.776 266.22C166.206 265.79 167.209 264.961 167.823 263.992C168.187 263.418 168.613 262.51 168.684 261.781C168.695 261.666 168.722 261.513 168.755 261.307C168.786 261.109 168.82 260.877 168.838 260.637C168.872 260.175 168.852 259.598 168.552 259.152C168.002 258.334 167.738 257.919 167.444 257.4C167.068 256.733 166.843 256.366 166.524 255.777C166.073 254.94 165.745 254.356 165.304 253.205C165.255 253.077 165.217 252.949 165.167 252.787C165.118 252.629 165.059 252.45 164.976 252.248C164.807 251.84 164.541 251.353 164.04 250.708C163.47 249.975 163.183 249.478 162.654 248.628C162.539 248.444 162.397 248.274 162.236 248.095C162.068 247.907 161.888 247.717 161.653 247.448C161.195 246.925 160.568 246.149 159.712 244.843C159.558 244.608 159.411 244.362 159.264 244.114L159.264 244.114C159.118 243.87 158.971 243.623 158.823 243.399C158.676 243.175 158.518 242.961 158.348 242.786C158.178 242.613 157.975 242.457 157.734 242.38C157.548 242.321 157.346 242.266 157.145 242.211L157.124 242.205C157.115 242.203 157.106 242.2 157.097 242.197C156.763 241.762 156.374 241.22 155.921 240.529C155.767 240.294 155.62 240.048 155.473 239.801C155.327 239.557 155.18 239.309 155.032 239.085C154.885 238.862 154.727 238.648 154.557 238.473C154.387 238.299 154.184 238.143 153.943 238.067C153.757 238.007 153.555 237.952 153.354 237.898L153.333 237.892L153.285 237.879C153.091 237.826 152.896 237.773 152.705 237.715C152.287 237.589 151.921 237.45 151.656 237.274C151.028 236.854 150.427 236.469 150.109 236.136C149.954 235.973 149.622 235.571 149.243 235.24Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-umalas" d="M145.167 234.033C144.913 234.007 143.656 233.973 142.275 233.973C142.173 233.931 140.798 234.65 140.387 234.099C140.215 233.869 140.019 233.723 139.846 233.516C139.633 233.261 139.306 232.881 139.034 232.56C138.753 232.228 138.471 231.87 138.137 231.57C137.891 231.349 137.526 230.999 137.172 230.512C136.944 230.198 136.635 229.806 136.649 229.479C136.675 228.886 136.789 228.622 136.908 228.346L136.912 228.337C137.132 227.83 137.392 227.378 137.589 226.323C137.706 225.695 137.249 224.673 137.046 224.124C136.877 223.668 136.753 223.168 136.895 222.839C137.049 222.483 137.462 222.049 138.326 221.062C138.621 220.724 138.806 220.539 138.968 220.361C139.129 220.183 139.441 219.922 139.78 219.659C140.042 219.455 140.451 219.189 140.848 218.998C141.514 218.678 141.732 218.609 141.963 218.483C142.226 218.339 142.725 218.097 143.148 218.026C143.701 217.934 144.317 217.916 144.331 217.745C144.356 217.424 144.345 217.135 144.305 216.985C144.237 216.731 144.202 216.422 144.034 216.215C143.847 215.987 143.618 215.743 143.33 215.444C142.646 214.735 142.121 214.579 142.114 213.997C142.106 213.398 142.29 213.078 142.487 212.857C142.699 212.619 142.972 212.276 143.325 212.027C143.782 211.707 144.172 211.492 144.569 211.453C144.915 211.419 145.22 211.36 145.694 211.326C146.292 211.284 147.215 211.262 147.623 211.403C148.062 211.555 148.296 211.613 148.528 211.81C148.806 212.047 149.06 212.302 149.289 212.495C149.501 212.673 149.765 212.848 150.143 213.274C150.346 213.501 150.599 213.928 151.006 214.127C151.074 214.16 151.157 214.155 151.183 214.101C151.363 213.734 151.659 213.288 152.2 212.67C152.376 212.468 152.822 211.894 153.572 211.264C154.052 210.861 154.092 210.364 154.278 210.186C154.671 209.809 155.051 209.393 155.454 208.91C155.665 208.656 156.385 208.695 156.598 208.492C156.793 208.306 156.976 208.159 157.199 208.095C157.523 208.001 157.959 207.892 158.231 207.875C158.621 207.85 159.008 207.771 159.356 207.994C159.687 208.206 160.177 208.661 160.566 209.103C160.939 209.527 161.301 209.918 161.428 210.186C161.598 210.542 161.68 211.221 161.622 211.598C161.579 211.878 161.439 212.458 161.343 212.961C161.258 213.402 161.267 213.895 160.875 215.158C160.73 215.627 160.512 216.197 160.023 217.008C159.535 217.819 158.783 218.831 158.412 219.395C157.993 220.033 157.771 220.321 157.569 220.693C157.348 221.101 156.956 221.555 157.114 222.276C157.215 222.741 157.307 223.8 157.164 224.601C157.113 224.889 156.989 225.108 156.417 225.88C155.911 226.565 155.701 226.931 155.454 227.309C155.133 227.799 154.829 228.091 154.821 228.573L154.82 228.622C154.795 229.974 154.788 230.326 154.471 230.644C153.644 231.47 153.248 231.918 152.798 232.367C152.578 232.587 151.697 233.516 151.064 233.974C150.852 234.127 150.679 234.304 150.378 234.482C150.005 234.701 149.46 234.55 148.967 234.482C148.594 234.431 147.687 234.482 147.174 234.321C146.831 234.214 146.382 234.329 146.123 234.269C145.792 234.193 145.459 234.062 145.167 234.033Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-sanur" d="M243.107 243.223L242.244 248.203L245.055 257.077L242.893 268.548L239.504 272.631L231.63 276.38L228.739 276.332L228.498 274.809C228.748 274.633 229.552 274.376 229.786 274.184C230.435 273.653 230.78 273.266 231.026 272.99L231.061 272.952C231.094 272.914 231.126 272.878 231.157 272.845C231.232 272.763 231.3 272.693 231.37 272.636C232.081 272.046 232.982 270.948 235.039 268.44L235.155 268.299C235.716 267.615 236.509 267.088 237.237 266.604C238.236 265.939 239.112 265.357 239.097 264.563C239.076 263.416 239.269 262.146 239.444 261.002C239.525 260.47 239.602 259.964 239.651 259.513C239.769 258.433 239.731 257.516 239.694 256.622C239.655 255.672 239.617 254.748 239.768 253.682C239.991 252.106 239.001 251.385 238.16 250.773C237.529 250.313 236.982 249.915 237.098 249.262C237.3 248.119 237.243 247.286 237.196 246.589C237.139 245.738 237.095 245.089 237.553 244.323C237.671 244.127 237.793 243.921 237.918 243.71L238.069 243.453L238.096 243.408C238.638 242.49 239.197 241.544 239.549 241.049C239.736 240.788 239.921 240.296 240.125 239.752C240.344 239.172 240.585 238.533 240.872 238.053L243.107 243.223Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-ceningan" d="M311.037 269.859L306.187 271.478L305.217 273.09L297.794 277.29L296.175 280.2L289.065 281.812L285.842 288.273L287.453 291.182L292.944 292.794L293.265 290.213L295.854 289.563L296.824 286.982L299.085 286.661L308.127 278.581L311.037 269.859Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-lembongan" d="M298.751 246.604L314.904 249.834L318.134 252.736L318.783 255.967L315.874 262.428L306.831 268.247L302.31 269.538L297.46 275.999H289.388H284.538L281.957 273.738L279.696 274.38L277.435 270.508L278.077 268.568L275.816 265.658L279.696 264.368L281.957 265.337L284.217 262.107L286.799 264.368L290.358 262.107H292.939L294.879 260.496L295.52 250.804L298.751 246.604Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-penida" d="M323 332.51L321.624 330.892L317.913 332.441C317.846 332.469 317.769 332.466 317.704 332.434C317.639 332.401 317.592 332.341 317.574 332.271L316.624 328.474L312.575 325.36L299.112 326.968C298.98 326.984 298.858 326.892 298.836 326.761L298.187 322.881C298.177 322.826 298.187 322.77 298.214 322.721L302.256 315.26L299.67 314.683C299.598 314.667 299.537 314.62 299.503 314.555C299.469 314.49 299.465 314.413 299.492 314.345L299.981 313.132L295.557 313.724C295.489 313.733 295.421 313.714 295.367 313.671L293.755 312.373C293.695 312.324 293.66 312.249 293.662 312.172C293.664 312.094 293.702 312.022 293.765 311.977L298.317 308.636L294.743 306.253C294.667 306.202 294.624 306.112 294.633 306.021L294.954 302.79L294.977 302.708C294.989 302.682 295.006 302.658 295.026 302.638L297.615 300.049L297.68 300.002L305.19 296.25L303.39 293.252C303.334 293.159 303.344 293.04 303.416 292.958L308.258 287.467L308.297 287.431C308.339 287.399 308.392 287.382 308.445 287.382H310.065L309.822 286.401C309.803 286.325 309.821 286.244 309.871 286.183L312.781 282.624L312.82 282.585C312.864 282.551 312.918 282.532 312.975 282.532H314.575L314.024 280.59C314.002 280.512 314.02 280.427 314.071 280.364L323 269.353V332.51Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region" id="loc-serangan" d="M209.411 287.553L213.963 285.636L216.361 283.482L219.958 283.956L224.273 287.797L224.991 291.15L223.074 291.868L221.394 290.669L220.439 289.233L218.759 290.669L220.195 292.112H221.638L221.875 293.793H219.477L219.714 295.228L216.842 298.344L218.041 298.581L220.439 296.183L222.356 296.664L224.273 294.992L223.792 293.067L225.953 290.432L228.588 290.669V292.112L226.908 294.511L227.152 296.909L223.792 297.863L223.311 300.979L218.996 304.821L215.399 304.576L213.482 301.942L211.565 300.506H208.93L208.686 302.896L211.084 304.821H213.482L215.643 306.974L214.444 309.136L212.046 309.373L211.084 312.488L209.648 312.97L204.852 310.572H203.653L199.582 308.41L201.018 300.742L202.698 295.71L204.134 292.349L206.769 291.15L209.411 287.553Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region bali-area-region" id="loc-uluwatu" data-area="uluwatu-area" d="M154.391 322.74C154.587 322.741 154.812 322.752 155.071 322.781C155.595 322.839 156.015 322.767 156.878 323.179C157.389 323.423 157.843 323.56 158.066 324.172C158.577 325.575 158.589 326.601 158.495 327.131C158.437 327.457 158.331 328.042 157.793 328.777C156.967 329.905 156.249 330.46 156.163 331.212C156.059 332.125 156.075 333.088 155.871 333.531C155.544 334.242 155.179 335.285 154.693 335.956C154.449 336.293 154.116 337.041 153.573 337.894C153.167 338.532 152.939 339.017 152.593 339.42C152.283 339.78 151.514 340.365 150.857 340.939C150.736 341.216 150.582 341.499 150.407 341.776C150.433 341.803 150.46 341.833 150.484 341.862C150.538 341.943 150.59 342.101 150.645 342.262L150.65 342.275C150.431 343.072 150.21 343.735 150.003 344.409C149.815 345.02 149.631 345.525 149.424 345.98C149.121 346.646 148.639 347.812 148.363 348.722C148.19 349.292 148.06 349.853 147.908 350.28C147.766 350.681 147.535 351.092 147.356 351.465C147.262 351.661 146.878 352.63 146.122 354.211C145.766 354.956 145.394 355.548 145.184 356.743C144.974 357.939 144.919 359.712 144.918 360.694C144.917 362.102 145.385 362.749 145.646 363.397C146.109 364.544 146.9 366.135 147.301 367.131C147.439 367.475 147.699 368.531 148.153 369.936C148.382 370.642 148.664 371.018 149.13 371.662C149.884 372.705 150.593 373.854 151.184 374.993C151.516 375.634 151.856 376.433 152.079 377.182C152.303 377.93 152.385 378.613 152.44 379.687C152.496 380.76 152.523 382.206 152.564 383.074C152.618 384.19 152.771 385.232 152.977 386.854C153.053 387.455 153.226 388.059 153.419 388.644C154.115 388.586 154.574 388.597 154.796 388.63C155.144 388.681 155.607 388.74 156.156 388.994C156.827 389.304 157.771 389.758 158.443 390.431C158.895 390.882 159.415 391.191 159.93 391.774C160.214 392.097 160.986 393.046 162.013 393.896C162.467 394.272 163.09 394.615 163.979 395.384C164.458 395.798 164.905 396.114 165.922 396.925C166.811 397.634 167.641 398.672 168.207 399.495C168.224 399.523 168.238 399.555 168.255 399.587L163.687 401.207L163.659 401.217L163.63 401.22L151.51 402.518L151.489 402.521L151.469 402.519L147.524 402.29L136.53 401.656L115.978 401.007H115.966L115.955 401.005L101.887 399.271L101.861 399.269L101.837 399.26L79.7578 391.684L79.6201 391.637L79.5928 391.494L78.7373 386.993L76.8135 383.786L76.7715 383.716L76.7793 383.635L77.0605 380.548L77.4287 376.495L77.4336 376.438L81.5713 369.463L81.6406 369.346L81.7783 369.341L88.6152 369.121L92.2285 365.936L92.3213 365.854L92.4434 365.878L95.5889 366.507L100.482 363.317L100.486 363.315L106.237 359.69L107.736 352.008L107.751 351.934L107.805 351.879L109.53 350.146L109.647 350.028L110.748 350.471L114.094 347.753L114.152 347.705L114.228 347.698L120.793 347.062L122.033 344.167L122.086 344.045L122.217 344.021L125.589 343.387L130.298 337.826L130.372 337.738H137.437L137.458 337.741L143.735 338.826L143.742 338.827L147.933 339.664L151.479 336.117L154.265 327.985L154.391 322.74Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region bali-area-region" id="loc-canggu" data-area="canggu-area" d="M142.071 195.344C142.681 195.378 143.287 195.457 143.674 195.495C144.158 195.541 144.559 195.651 144.983 195.887C145.396 196.116 145.818 196.459 146.354 196.945C147.019 197.548 147.431 198.042 147.785 198.644C147.895 198.831 147.936 199.046 147.953 199.242C147.97 199.44 147.964 199.655 147.954 199.86C147.934 200.296 147.721 200.676 147.482 201.031C147.222 201.419 146.952 201.754 146.641 202.251C146.161 203.017 145.63 203.5 145.153 203.864C144.921 204.04 144.691 204.196 144.507 204.328C144.315 204.465 144.165 204.581 144.049 204.702C143.885 204.871 143.709 205.177 143.509 205.575C143.321 205.948 143.113 206.398 142.901 206.762C142.517 207.423 142.112 208.025 141.545 208.462C141.131 208.781 140.692 209.246 140.453 209.758C140.309 210.066 140.219 210.401 140.143 210.758C140.07 211.097 140.003 211.498 139.914 211.845C139.751 212.482 139.337 212.963 138.861 213.419C138.129 214.123 137.643 214.875 136.818 216.091C136.597 216.418 136.455 216.752 136.264 217.181C136.075 217.606 135.848 218.097 135.465 218.685C135.13 219.198 134.772 219.596 134.408 219.973C134.04 220.355 133.681 220.704 133.303 221.149C132.843 221.69 132.471 222.223 132.007 222.902C131.655 223.416 131.171 224.695 130.88 226.08L130.854 226.202C130.396 228.381 130.204 229.3 130.148 229.918C130.134 230.077 130.094 230.267 130.058 230.477C130.019 230.702 129.973 231.003 129.936 231.444C129.787 233.186 129.972 235.112 130.184 236.513C130.266 237.059 130.233 237.527 130.155 237.966L126.193 233.191L117.324 225.823C117.536 225.596 117.752 225.35 117.969 225.083C118.494 224.437 119.017 223.716 119.576 222.98C120.164 222.206 120.722 221.588 121.222 221.053C121.727 220.513 122.157 220.072 122.518 219.627C123.595 218.298 124.069 217.376 124.451 216.595C124.853 215.775 124.956 214.863 124.977 213.653C124.982 213.312 124.843 212.97 124.667 212.657C124.58 212.501 124.493 212.368 124.414 212.242C124.377 212.182 124.338 212.12 124.308 212.062C124.281 212.012 124.241 211.929 124.226 211.837C124.181 211.574 124.3 211.324 124.414 211.137C124.537 210.936 124.714 210.716 124.91 210.488C125.316 210.016 125.824 209.484 126.333 208.831C127.119 207.824 128.243 207.101 128.738 206.694C129.193 206.32 129.985 205.584 130.915 204.949C132.912 203.585 133.18 202.956 133.948 202.297C135.013 201.384 135.283 200.802 135.499 200.3C135.652 199.944 135.783 199.554 135.92 199.162C136.053 198.781 136.195 198.39 136.367 198.077C136.771 197.34 137.36 196.93 138.111 196.398L138.165 196.36C138.896 195.842 139.537 195.666 140.232 195.472L140.241 195.469C140.791 195.316 141.463 195.31 142.071 195.344Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region bali-area-region" id="loc-pererenan" data-area="canggu-area" d="M140.777 179.642C141.142 179.635 141.407 179.887 141.652 179.995C141.938 180.121 142.172 180.241 142.418 180.349C142.799 180.517 143.212 180.829 143.468 180.977C143.752 181.141 144.115 181.32 144.399 181.467C144.992 181.772 145.019 182.222 145.117 182.458C145.22 182.705 145.235 183.454 145.177 183.988C145.142 184.306 145.04 184.578 144.863 184.892C144.525 185.493 143.923 186.283 143.656 186.649C143.456 186.924 143.273 187.169 143.155 187.395C143.03 187.635 142.569 188.011 142.282 188.396C142.09 188.653 141.88 188.877 141.683 189.142C141.402 189.52 141.212 189.76 140.898 190.044C140.646 190.273 140.466 190.487 139.801 191.142C139.507 191.431 139.328 191.683 139.005 192.056C138.708 192.398 138.503 192.586 138.268 192.87C138.067 193.114 137.972 193.353 137.759 193.654C136.78 195.036 136.286 195.471 136.157 195.707C136.016 195.966 135.931 197.014 135.805 197.66C135.726 198.059 135.284 198.299 134.98 198.622C134.391 199.249 133.715 200.063 133.508 200.467C133.313 200.847 133.124 201.183 133.036 201.439C132.908 201.808 132.712 202.067 132.595 202.439C132.315 203.322 132.358 203.599 132.222 203.854C132.186 203.919 132.153 203.981 132.122 204.041C131.839 204.265 131.503 204.514 131.095 204.793C130.164 205.429 129.372 206.164 128.918 206.538C128.422 206.946 127.299 207.669 126.513 208.676C126.003 209.328 125.495 209.861 125.09 210.332C124.894 210.56 124.717 210.78 124.594 210.982C124.48 211.168 124.361 211.418 124.405 211.682C124.421 211.774 124.461 211.856 124.487 211.906C124.518 211.964 124.556 212.026 124.594 212.086C124.672 212.212 124.758 212.345 124.846 212.501C125.021 212.814 125.162 213.156 125.156 213.497C125.136 214.707 125.032 215.619 124.631 216.44C124.248 217.221 123.775 218.142 122.697 219.472C122.337 219.916 121.906 220.357 121.401 220.898C120.901 221.433 120.343 222.05 119.755 222.824C119.196 223.56 118.674 224.281 118.148 224.928C117.893 225.242 117.641 225.532 117.392 225.789C117.355 225.786 117.321 225.786 117.294 225.797L113.442 222.598L105.029 215.699C105.029 215.699 98.1223 212.725 97.6473 212.307L97.5789 212.247C97.1276 211.85 96.6851 211.459 96.2577 211.138C96.0432 210.977 95.8511 210.818 95.6844 210.597C95.5186 210.377 95.3712 210.085 95.2625 209.653C94.8806 208.135 94.9942 207.109 95.2703 206.345C95.3131 206.227 95.3608 206.115 95.41 206.008C95.4724 205.959 95.5373 205.91 95.6014 205.858C95.6627 205.719 96.4964 205.131 96.7606 204.847C96.9881 204.602 97.2803 204.386 97.4871 204.14C97.6661 203.927 97.8506 203.64 98.0174 203.374C98.1755 203.124 98.5753 203.089 98.8309 203.011C99.0684 202.938 99.3023 202.814 99.5965 202.55C99.8818 202.293 100.126 202.03 100.411 201.775C100.664 201.547 100.892 201.303 101.138 201.136C101.415 200.947 101.853 200.969 102.139 200.842C102.417 200.718 102.853 200.461 103.287 200.107C103.559 199.885 103.954 199.792 104.297 199.723C105.058 199.57 105.309 199.81 105.555 199.899C105.865 200.01 106.133 200.144 106.398 200.262C106.84 200.459 107.388 200.654 107.733 200.773C108.465 201.023 109.842 200.793 110.313 200.646C110.746 200.511 111.039 200.302 111.315 200.174C111.558 200.061 111.826 199.891 112.169 199.724C112.86 199.387 113.218 199.321 113.601 199.174C113.985 199.027 114.246 198.747 115.298 197.615L115.385 197.522C115.795 197.08 115.847 196.273 116.063 195.698C116.658 194.121 117.145 193.982 117.381 193.873C118.027 193.577 119.42 193.726 120.01 193.696C120.597 193.667 121.09 193.275 121.59 192.952C122.047 192.656 122.443 192.255 122.788 191.96C123.089 191.702 123.446 191.391 123.711 191.165C124.119 190.818 124.505 190.586 124.761 190.38C125.187 190.036 125.624 189.684 126.037 189.497C126.462 189.305 126.665 188.919 127.272 188.301C127.61 187.958 127.94 187.662 128.431 187.358C128.834 187.107 129.293 186.74 129.609 186.454C129.958 186.14 130.257 185.974 130.522 185.758C130.894 185.456 131.239 185.051 131.455 184.913C131.854 184.658 132.494 184.149 133.259 183.444C133.845 182.903 134.377 182.541 134.753 182.322C135.068 182.139 135.4 181.949 135.645 181.821C135.944 181.667 136.594 181.538 137.166 181.243C137.581 181.029 137.873 180.948 138.158 180.713C138.392 180.52 138.639 180.379 138.875 180.222C139.124 180.056 139.404 179.907 139.649 179.77C139.917 179.62 140.268 179.652 140.777 179.642Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region bali-area-region" id="loc-tabanan" data-area="tabanan-area" d="M36.8793 76.1636C38.3382 75.8043 39.2948 75.7318 39.977 75.8453C40.4566 75.9251 42.098 76.4525 44.8549 76.9283C46.2421 77.1677 47.6287 77.2861 49.2397 77.7535C50.8508 78.2209 52.6726 78.943 53.6469 79.5318C54.8979 80.2878 55.5797 80.8993 56.2172 81.3267C56.6979 81.649 57.7571 82.9003 58.3969 83.648C58.7383 84.047 59.3081 84.656 59.9379 85.5083C60.3369 86.0483 60.6604 86.5247 61.2172 87.2085C61.7404 87.8511 62.4551 89.083 63.2777 89.608C63.7782 89.9272 64.4122 90.8363 65.7192 91.4683C66.3396 91.7683 66.9019 91.9845 68.644 92.3082C70.4653 92.6465 71.8381 92.6098 72.6801 92.8072C73.703 93.0471 74.825 93.1188 75.4604 93.5484C76.2596 94.089 76.8039 94.5048 78.141 95.7105C78.7393 96.2501 80.1111 97.8448 81.0795 98.7691C81.5403 99.2089 82.4923 99.9389 83.2797 100.79C84.2716 101.861 86.0969 103.376 86.56 103.93C87.0634 104.533 87.7963 105.152 88.2807 105.651C88.9017 106.29 89.5316 106.617 90.0404 107.191C90.6633 107.894 91.2905 108.633 92.7445 109.813C93.3825 110.331 94.6799 111.549 96.226 113.095C96.9007 113.77 97.1278 114.065 97.5238 114.494C98.7424 115.814 99.5717 116.483 99.6205 117.556C99.7009 119.332 99.7221 120.226 100.181 120.993C100.193 121.012 100.205 121.031 100.217 121.05C101.533 122.047 103.607 122.908 105.077 123.618C105.698 123.918 106.483 124.2 107.327 124.532C108.163 124.861 109.048 125.235 109.841 125.715C110.55 126.144 111.297 126.543 111.952 126.97C112.613 127.402 113.213 127.883 113.656 128.504L113.68 128.538C114.619 129.854 115.594 131.218 115.662 133.364C115.776 136.996 115.915 138.048 116.153 139.208C116.376 140.294 116.725 141.501 116.839 142.877C117.067 145.618 116.85 149.69 116.646 151.011C116.371 152.794 115.509 154.59 114.804 156.04C114.172 157.34 113.862 158.378 112.931 159.819C112.102 161.102 111.353 162.339 110.385 163.809C109.347 165.385 108.305 166.488 108.255 168.783C108.179 172.298 108.169 174.537 108.108 176.121C108.046 177.707 107.932 178.658 107.637 179.601C107.256 180.822 106.902 181.792 106.607 182.585C106.31 183.38 106.077 183.987 105.93 184.493C105.594 185.654 105.329 187.452 105.255 189.049C105.14 191.554 104.863 193.047 104.24 194.106C103.582 195.223 102.75 196.234 102.017 197.093C101.126 198.138 100.09 199.208 99.4057 200.196C98.7586 201.13 98.1763 201.917 97.6635 202.616C97.1497 203.316 96.7066 203.927 96.3363 204.516C95.996 205.057 95.5528 205.566 95.2709 206.345C94.9946 207.11 94.881 208.135 95.2631 209.654C95.3718 210.086 95.5191 210.377 95.685 210.597C95.8517 210.818 96.0437 210.977 96.2582 211.138C96.7071 211.476 97.1729 211.889 97.6478 212.307L92.102 209.808L92.0365 209.779L92.0072 209.713L88.557 201.962L84.4818 198.531L84.4574 198.511L84.4418 198.484L76.6518 185.494L76.6283 185.455L76.6254 185.41L76.1967 179.222L73.517 177.368L71.9633 177.595L64.3334 167.126L46.603 151.348L26.9164 134.687L20.4819 130.55C20.4328 130.544 20.384 130.536 20.3354 130.53L14.7739 126.955L14.7573 126.944L14.7426 126.931L5.52192 118.735C5.41898 118.067 5.26201 117.28 5.22993 116.604C5.16932 115.327 5.02564 114.765 4.92915 114.227C4.72993 113.116 4.79821 111.431 5.01118 110.445C5.2104 109.523 5.51235 108.59 5.65083 107.361C5.89445 105.198 6.31851 103.931 6.41157 103.225C6.53093 102.32 6.50238 100.571 7.63618 98.8785C9.05286 96.7633 9.76732 95.7188 10.393 95.0044C11.0956 94.2023 11.9154 93.3448 12.4125 92.7447C12.8932 92.1645 13.3336 91.7289 13.7934 91.2837C14.4533 90.6448 14.7368 90.1209 16.1948 88.8833C16.8536 88.3241 17.6546 87.6842 18.3344 87.3248C19.0143 86.9654 19.9599 86.6163 21.2162 85.9244C22.0147 85.4846 22.6935 85.0805 23.6957 84.6441C24.6161 84.2433 25.327 83.7496 25.8744 83.5044C26.4545 83.2447 26.852 82.923 27.6576 82.3423C29.0155 81.3637 29.5121 80.8902 30.7006 79.9595C32.5369 78.5215 33.5189 77.7585 34.2963 77.2232C35.1364 76.6448 35.8583 76.4151 36.8793 76.1636Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '<path class="bali-region bali-area-region" id="loc-ubud" data-area="ubud-area" d="M207.971 142.94C210.233 145.414 212.334 147.791 213.232 148.899C213.446 149.531 213.374 150.054 213.618 150.368C213.862 150.682 217.577 150.993 219.972 150.747C220.984 150.222 221.99 149.276 223.366 147.944C226.638 144.778 227.735 144.151 228.452 142.997C229.08 141.984 230.361 141.034 230.789 139.891C231.103 139.053 231.886 137.884 233.415 136.289C235.852 133.746 236.58 132.83 237.248 132.072C238.294 130.886 238.92 130.116 242.488 126.798C243.948 125.441 244.272 124.312 244.96 123.522C245.903 122.438 246.72 121.375 247.122 120.242C247.508 119.155 247.855 117.565 248.659 116.928C248.835 116.789 249.076 116.666 249.217 116.792C249.53 117.071 249.971 117.691 250.298 118.538C250.649 119.448 251.232 120.536 251.309 121.577C251.415 123.008 251.742 124.593 252.638 125.449C253.442 126.216 254.255 126.834 255.116 127.122C255.955 127.401 256.871 128.363 258.123 128.342C260.352 128.306 261.981 128.623 262.864 127.886C263.282 127.537 263.576 126.076 263.664 124.707C263.77 123.062 263.791 120.84 263.733 119.187C263.628 116.152 263.594 114.459 263.244 112.175C262.999 110.573 262.708 109.601 262.406 108.515C262.024 107.143 261.826 104.98 262.515 104.292C263.355 103.454 264.233 102.557 265.168 102.235C266.078 101.921 267.06 101.727 268.589 101.537C269.994 101.364 271.763 101.279 271.691 100.8C271.585 100.103 271.096 99.4288 271.097 98.5618C271.099 96.0531 272.01 94.7903 272.251 93.6125C272.423 92.7738 272.183 91.9143 271.269 90.4683C270.253 88.8621 268.448 87.3135 267.256 86.6686C266.417 86.2152 265.373 85.5812 264.358 85.9734C263.906 86.1482 262.89 87.6212 261.391 88.1376C260.273 88.5229 259.042 89.2604 257.899 89.1836C256.294 89.0757 254.952 88.918 254.553 87.9585C254.204 87.1199 253.926 86.144 253.646 84.8154C253.367 83.4888 253.413 82.4725 252.984 80.4524C252.738 79.3007 252.572 77.0673 252.425 75.568C252.32 74.4843 252.038 73.3904 251.971 72.3913C251.763 69.2827 251.986 64.7369 252.218 63.6664C252.6 61.9074 252.321 59.2684 251.621 57.6983C251.201 56.756 250.646 55.3157 249.487 55.3635C247.709 55.4368 246.656 55.6935 245.896 56.1686C245.057 56.6932 244.32 57.3449 243.521 58.1255C241.979 59.6332 240.732 61.1589 240.243 61.9985C239.755 62.8372 239.618 63.9896 237.411 65.6673C235.63 67.0211 234.356 66.8071 230.219 67.2661C228.653 67.4399 227.318 67.242 226.631 67.931C225.792 68.7717 225.032 69.7077 224.502 70.6909C223.769 72.051 223.159 74.5025 223.703 76.2035C223.983 77.0768 224.584 78.0329 225.031 79.0316C225.658 80.4315 226.188 81.6219 226.6 82.5203C226.986 83.3589 227.489 84.22 227.927 85.0687C228.523 86.2236 229.305 87.324 229.322 89.883C229.356 95.3265 229.253 99.097 228.9 99.4822C228.517 99.8999 227.541 100.295 226.176 101.717C225.373 102.553 224.473 103.656 223.455 104.263C222.58 104.785 221.01 105.651 220.35 106.847C219.791 107.859 219.173 110.861 217.767 110.857C217.418 110.856 217.018 110.603 216.579 110.402C215.741 110.016 215.018 109.117 213.892 108.936C212.378 108.693 209.955 107.505 208.41 108.59C207.364 109.325 206.669 110.161 206.11 110.999C205.551 111.838 204.964 112.665 204.645 113.898C204.366 114.979 203.458 116.045 203.459 118.448C203.461 122.798 204.094 124 204.124 126.61C204.156 129.428 203.188 133.685 204.999 135.885C205.486 136.477 206.03 136.799 206.254 137.21C206.462 137.593 206.44 138.236 206.567 139.063C206.812 140.669 207.043 141.925 207.971 142.94Z" fill="#D4CFC9" stroke="#C5BDB5" stroke-width="0.5"/>'
    + '</svg>';

    function mk(tag, attrs, children) {
      var e = document.createElement(tag);
      if (attrs) {
        for (var k in attrs) {
          if (!attrs.hasOwnProperty(k)) continue;
          if (k === 'class') e.className = attrs[k];
          else if (k === 'html')  e.innerHTML = attrs[k];
          else if (k === 'text')  e.textContent = attrs[k];
          else e.setAttribute(k, attrs[k]);
        }
      }
      if (children) {
        for (var i = 0; i < children.length; i++) {
          if (children[i]) e.appendChild(children[i]);
        }
      }
      return e;
    }

    function makeLabel(text) {
      return mk('div', { class: 'filter-label', text: text });
    }

    function makeTrigger(text) {
      return mk('div', { class: 'filter-trigger' }, [
        mk('div', { class: 'filter-trigger_value' }, [
          mk('div', { class: 'filter-trigger_text', text: text })
        ]),
        mk('div', { class: 'trigger-chevron', html: CHEVRON_SVG })
      ]);
    }

    function makeOption(value, label, checked, withCheckbox) {
      var children = [];
      if (withCheckbox !== false) children.push(mk('div', { class: 'filter-checkbox' }));
      children.push(mk('div', { class: 'text-size-small filter-option_label', text: label }));
      return mk('div', {
        class: 'filter-option' + (checked ? ' is-active' : ''),
        'data-value': value
      }, children);
    }

    function makeField(children) {
      return mk('div', { class: 'filter-field' }, children);
    }

    function makeDropdown(children) {
      return mk('div', { class: 'filter-dropdown' }, [
        mk('div', { class: 'filter-options' }, children)
      ]);
    }

    // ── Bedrooms ──
    var bedsField = makeField([
      makeLabel('Bed Rooms'),
      makeTrigger('Any'),
      makeDropdown([
        makeOption('Any', 'Any', true),
        makeOption('1',  '1 Br',  false),
        makeOption('2',  '2 Br',  false),
        makeOption('3',  '3 Br',  false),
        makeOption('4',  '4 Br',  false),
        makeOption('5',  '5 Br',  false),
        makeOption('6+', '6+ Br', false)
      ])
    ]);

    // ── Availability ──
    var availField = makeField([
      makeLabel('Availability'),
      makeTrigger('Any'),
      makeDropdown([
        makeOption('Any',       'Any',       true,  false),
        makeOption('Available', 'Available', false, false),
        makeOption('Rented',    'Rented',    false, false)
      ])
    ]);

    // ── Keyword ──
    var kwInput = mk('input', {
      class: 'keyword-input',
      type: 'search',
      placeholder: 'Search\u2026',
      maxlength: '256'
    });
    var kwField = makeField([
      makeLabel('Keyword / Listing Code'),
      mk('div', { class: 'filter-trigger' }, [kwInput])
    ]);

    // ── Location ──
    var locSearchInput = mk('input', {
      class: 'location-search-input',
      type: 'text',
      placeholder: 'Search locations\u2026'
    });
    var treeScrollEl  = mk('div', { class: 'tree-scroll' });
    var pillScrollEl  = mk('div', { class: 'pill-scroll' });
    var svgMapWrap    = mk('div', { class: 'bali-svg-wrap' });
    svgMapWrap.innerHTML = BALI_SVG;
    var locSelInfo    = mk('div', { id: 'locSelectedInfo', class: 'loc-selected-info', text: 'No Location Selected' });
    var locBtnClear   = mk('a',  { href: '#', class: 'loc-btn-clear-inline',  text: 'Clear' });
    var locBtnApply   = mk('a',  { href: '#', class: 'loc-btn-apply-inline',  text: 'Search' });
    var locCloseBtn   = mk('div', { class: 'close-btn', html: CLOSE_SVG });

    var locTabArea = mk('button', { class: 'loc-tab loc-tab-area is-active', type: 'button', text: 'Area' });
    var locTabMaps = mk('button', { class: 'loc-tab loc-tab-maps', type: 'button', text: 'Maps' });

    var locDropdown = mk('div', { class: 'location-dropdown' }, [
      locCloseBtn,
      mk('div', { class: 'loc-tabs' }, [locTabArea, locTabMaps]),
      mk('div', { class: 'loc-panel-area is-active' }, [
        mk('div', { class: 'location-search' }, [
          mk('img', { src: PIN_URL, alt: '' }),
          locSearchInput
        ]),
        treeScrollEl
      ]),
      mk('div', { class: 'loc-panel-maps' }, [
        pillScrollEl,
        mk('div', { class: 'bali-map-wrap' }, [svgMapWrap])
      ]),
      mk('div', { class: 'loc-map-footer' }, [
        locSelInfo,
        mk('div', { class: 'loc-actions' }, [locBtnClear, locBtnApply])
      ])
    ]);

    var locTrigger = mk('div', { class: 'location-trigger' }, [
      mk('div', { class: 'filter-trigger_value' }, [
        mk('div', { class: 'location-trigger_text', text: 'All Location' })
      ]),
      mk('div', { class: 'trigger-chevron', html: CHEVRON_SVG })
    ]);

    var locField = makeField([
      makeLabel('Location'),
      locTrigger,
      locDropdown
    ]);

    // ── Price ──
    var pwFillEl    = mk('div', { id: 'pwFill',      class: 'pw-fill' });
    var pwTrackEl   = mk('div', {                     class: 'pw-track' });
    var pwSliderEl  = mk('div', {                     class: 'pw-slider' }, [pwTrackEl, pwFillEl]);
    var pwMinText   = mk('input', { id: 'pwMinText', class: 'pw-box', type: 'text', value: '0' });
    var pwMaxText   = mk('input', { id: 'pwMaxText', class: 'pw-box', type: 'text', value: '0' });
    var pwScaleMinEl = mk('span', { id: 'pwScaleMin', class: 'pw-scale-min', text: 'Rp0' });
    var pwScaleMaxEl = mk('span', { id: 'pwScaleMax', class: 'pw-scale-max', text: 'Rp0' });
    var pwRangeTextEl = mk('div', { id: 'pwRangeText', class: 'pw-range-value', text: '0' });
    var priceCloseBtn = mk('div', { class: 'close-btn', html: CLOSE_SVG });

    var priceDropdown = mk('div', { class: 'price-dropdown' }, [
      mk('div', { class: 'price-panel' }, [
        mk('div', { class: 'pp-section' }, [
          mk('div', { class: 'pp-section-title', text: 'QUICK\u00a0SELECTION' }),
          mk('div', { class: 'pw-quick' }, [
            mk('div', { class: 'pw-chip', 'data-chip': '0', text: '< 50jt' }),
            mk('div', { class: 'pw-chip', 'data-chip': '1', text: '50jt \u2013 200jt' }),
            mk('div', { class: 'pw-chip', 'data-chip': '2', text: '> 200jt' })
          ])
        ]),
        mk('div', { class: 'pp-section' }, [
          mk('div', { class: 'pp-section-title', text: 'CUSTOM\u00a0RANGE' }),
          mk('div', { class: 'pw-rows' }, [
            mk('div', { class: 'pw-row-item' }, [
              mk('div', { class: 'pw-label', text: 'Minimum Price' }),
              mk('div', { class: 'pw-box-wrap' }, [
                mk('div', { id: 'pwSymbolMin', class: 'pw-symbol', text: 'Rp' }),
                pwMinText
              ])
            ]),
            mk('div', { class: 'pw-row-item' }, [
              mk('div', { class: 'pw-label', text: 'Maximum Price' }),
              mk('div', { class: 'pw-box-wrap' }, [
                mk('div', { id: 'pwSymbolMax', class: 'pw-symbol', text: 'Rp' }),
                pwMaxText
              ])
            ])
          ])
        ]),
        mk('div', { class: 'pp-section pp-section--slider' }, [
          mk('div', { class: 'pw-range-head' }, [
            mk('div', { class: 'pw-range-label', text: 'PRICE RANGE' }),
            pwRangeTextEl
          ]),
          pwSliderEl,
          mk('div', { class: 'pw-scale' }, [pwScaleMinEl, pwScaleMaxEl])
        ])
      ]),
      priceCloseBtn
    ]);

    var priceTrigText = mk('div', { class: 'price-trigger_text', text: 'Price Range' });
    var priceTrigger  = mk('div', { class: 'price-trigger' }, [
      mk('div', { class: 'filter-trigger_value' }, [priceTrigText]),
      mk('div', { class: 'trigger-chevron', html: CHEVRON_SVG })
    ]);

    var priceField = makeField([
      makeLabel('Price'),
      mk('div', { class: 'price-trigger-wrapper' }, [
        priceTrigger,
        mk('div', { class: 'price-note', text: 'Price for reference only. Payments in IDR.' })
      ]),
      priceDropdown
    ]);

    // ── Currency ──
    var currField = makeField([
      makeLabel('Currency'),
      makeTrigger('IDR'),
      makeDropdown([
        makeOption('IDR', 'IDR', true,  true),
        makeOption('USD', 'USD', false, true),
        makeOption('EUR', 'EUR', false, true)
      ])
    ]);

    // ── Form close (mobile) ──
    var formCloseBtn = mk('div', { class: 'close-btn', html: CLOSE_SVG });
    var mobileHeader = mk('div', { class: 'bhb-mobile-header' }, [
      mk('div', { class: 'bhb-mobile-header-title', text: 'Search' }),
      formCloseBtn
    ]);

    // ── Action buttons ──
    var btnClear  = mk('a', { href: '#', class: 'filter-button-1', text: 'Clear' });
    var btnSearch = mk('a', { href: '#', class: 'filter-button-2', text: 'Search Properties' });

    // ── Assemble ──

    // ── Mobile collapsed card (≤991px) ──
    var mobileCollapsed = mk('div', { class: 'bhb-mobile-collapsed' }, [
      mk('div', { class: 'bhb-mobile-title', text: 'Search Your Property' }),
      mk('div', { class: 'bhb-mobile-search-trigger' }, [
        mk('span', { class: 'bhb-mobile-search-placeholder', text: 'Search\u2026' })
      ])
    ]);

    var filterForm = mk('div', { class: 'rent-filter_form' }, [
      mobileHeader,
      mobileCollapsed,
      mk('div', { class: 'rent-filter_top' }, [
        bedsField, availField, kwField
      ]),
      mk('div', { class: 'rent-filter_divider' }),
      mk('div', { class: 'rent-filter_bottom' }, [
        mk('div', { class: 'rent-filter_bottom-fields' }, [
          locField, priceField, currField
        ]),
        mk('div', { class: 'rent-filter_actions' }, [
          mk('div', { class: 'filter-button-style-1' }, [btnClear]),
          mk('div', { class: 'filter-button-style-1 dark-btn' }, [btnSearch])
        ])
      ])
    ]);

    // ── Overlay backdrop for mobile panel ──
    var overlay = mk('div', { id: 'bhbOverlay', class: 'bhb-overlay' });
    root.appendChild(overlay);
    root.appendChild(filterForm);
  }

  // ─── init ─────────────────────────────────────────────────────────────────

  function init() {
    buildUI();
    cacheEls();
    if (!el.grid) return;

    allCards = Array.from(el.grid.querySelectorAll(CFG.CARD_SEL));
    if (!allCards.length) return;

    areas = [];
    buildAreas();
    buildLocDOM();
    buildMapDots();
    mountLocUI();
    computeBaseBounds(); // initial bounds — may exclude non-IDR cards until rates load
    initPricePanel();
    hydrateCoordsFromCMS();
    loadMapSDK(initMap);
    updateLocText();
    bindEvents(); // includes bhb:rates-ready listener for bounds recompute
    setCurrency("IDR");
    filtered = allCards.slice();
    showNext();
    updateUI();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
