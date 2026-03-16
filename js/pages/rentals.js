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
    markers = [];
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
        if (locDropOpen && !map) loadMapSDK(initMap);
        else if (locDropOpen && map)
          setTimeout(function () {
            map.resize();
          }, 250);
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
    var panel = el.locDropdown.querySelector(".location-panel");
    if (!panel) return;
    var treeScroll = panel.querySelector(".tree-scroll");
    var pillScroll = panel.querySelector(".pill-scroll");
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
    var panel = el.locDropdown.querySelector(".location-panel");
    if (!panel) return;
    locUI = {
      searchInput: panel.querySelector(".location-search-input"),
      treeScroll: panel.querySelector(".tree-scroll"),
      pillScroll: panel.querySelector(".pill-scroll"),
      selectedInfo: panel.querySelector("#locSelectedInfo"),
      btnClear: panel.querySelector(".loc-btn-clear-inline"),
      btnApply: panel.querySelector(".loc-btn-apply-inline"),
    };
    if (!locUI.searchInput || !locUI.treeScroll || !locUI.pillScroll) return;

    // Attach listeners to existing elements
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

    locUI.searchInput.addEventListener("input", renderLocLists);
    if (locUI.btnClear) {
      locUI.btnClear.addEventListener("click", function () {
        draftLocs = [];
        renderLocLists();
        syncMapWith(draftLocs);
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
    }
    el.locDropdown.style.display = locDropOpen ? "block" : "none";
    el.locDropdown.classList.toggle("is-open", locDropOpen);
    if (locDropOpen && map)
      setTimeout(function () {
        map.resize();
      }, 80);
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
    var mapContEl     = mk('div', { id: 'bhbMap' });
    var locSelInfo    = mk('div', { id: 'locSelectedInfo', class: 'loc-selected-info', text: 'No Location Selected' });
    var locBtnClear   = mk('a',  { href: '#', class: 'loc-btn-clear-inline',  text: 'Clear' });
    var locBtnApply   = mk('a',  { href: '#', class: 'loc-btn-apply-inline',  text: 'Search' });
    var locCloseBtn   = mk('div', { class: 'close-btn', html: CLOSE_SVG });

    var locDropdown = mk('div', { class: 'location-dropdown' }, [
      locCloseBtn,
      mk('div', { class: 'location-panel' }, [
        mk('div', { class: 'location-col is-left' }, [
          mk('div', { class: 'location-search' }, [
            mk('img', { src: PIN_URL, alt: '' }),
            locSearchInput
          ]),
          treeScrollEl
        ]),
        mk('div', { class: 'location-col is-middle' }, [pillScrollEl]),
        mk('div', { class: 'location-col is-right' }, [
          mk('div', { class: 'map-wrap' }, [mapContEl]),
          mk('div', { class: 'loc-map-footer' }, [
            locSelInfo,
            mk('div', { class: 'loc-actions' }, [locBtnClear, locBtnApply])
          ])
        ])
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

    // ── Action buttons ──
    var btnClear  = mk('a', { href: '#', class: 'filter-button-1', text: 'Clear' });
    var btnSearch = mk('a', { href: '#', class: 'filter-button-2', text: 'Search Properties' });

    // ── Assemble ──
    priceField.classList.add('is-price');

    var filterForm = mk('div', { class: 'rent-filter_form' }, [
      formCloseBtn,
      mk('div', { class: 'rent-filter_grid' }, [
        bedsField, availField, kwField, locField,
        priceField, currField
      ]),
      mk('div', { class: 'rent-filter_actions' }, [
        mk('div', { class: 'filter-button-style-1' }, [btnClear]),
        mk('div', { class: 'filter-button-style-1 dark-btn' }, [btnSearch])
      ])
    ]);

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
