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
    {
      id: "canggu-area",
      label: "Canggu area",
      keys: [
        "canggu",
        "pererenan",
        "seseh",
        "cemagi",
        "kaba kaba",
        "kaba-kaba",
        "cepaka",
        "tumbak bayuh",
        "buwit",
        "buduk",
        "dalung",
      ],
    },
    {
      id: "uluwatu-area",
      label: "Uluwatu area",
      keys: ["bingin", "uluwatu", "uluwatu center", "ungasan"],
    },
    {
      id: "ubud-area",
      label: "Ubud area",
      keys: ["ubud", "ubud center"],
    },
    {
      id: "tabanan-area",
      label: "Tabanan area",
      keys: ["kedungu", "nyanyi", "pandak gede", "nyambu", "tanah lot"],
    },
  ];

  // ─── map pin coordinates per location ─────────────────────────────────────
  var LOC_COORDS = {
    canggu: [115.1365, -8.65062],
    pererenan: [115.12346, -8.64904],
    seseh: [115.11505, -8.6456],
    cemagi: [115.11502, -8.62971],
    "kaba kaba": [115.13919, -8.59345],
    "kaba-kaba": [115.13919, -8.59345],
    cepaka: [115.14526, -8.59917],
    "tumbak bayuh": [115.14562, -8.61484],
    buwit: [115.12362, -8.59905],
    dalung: [115.17258, -8.61147],
    buduk: [115.16263, -8.59877],
    bingin: [115.092, -8.812],
    uluwatu: [115.088, -8.82828],
    "uluwatu center": [115.088, -8.82828],
    ungasan: [115.16562, -8.82695],
    ubud: [115.26229, -8.5069],
    "ubud center": [115.26229, -8.5069],
    kedungu: [115.09045, -8.60254],
    nyanyi: [115.11025, -8.61237],
    "pandak gede": [115.128, -8.585],
    nyambu: [115.132, -8.578],
    "tanah lot": [115.12604, -8.58208],
  };

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
    if (window.innerWidth < 768) {
      var panel = document.querySelector(".rent-filter_form-block");
      if (panel) panel.style.display = "none";
    }
    closeAll();
    if (locDropOpen) openLocDrop(false);
  }

  // inject close buttons into filter dropdowns
  function injectDropdownCloseBtns() {
    var drops = document.querySelectorAll(".filter-dropdown,.price-dropdown");
    for (var i = 0; i < drops.length; i++) {
      if (drops[i].querySelector(".drop-close-btn")) continue;
      var btn = document.createElement("button");
      btn.className = "drop-close-btn";
      btn.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1L11 11M11 1L1 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      btn.setAttribute("aria-label", "Close");
      drops[i].insertBefore(btn, drops[i].firstChild);
      (function (drop) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          drop.style.display = "none";
          drop.classList.remove("is-open");
          var field = drop.closest(".filter-field");
          if (field) {
            var trig = field.querySelector(".filter-trigger,.price-trigger");
            if (trig) trig.classList.remove("is-active");
          }
        });
      })(drops[i]);
    }
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
        if (window.innerWidth < 768) {
          var panel = document.querySelector(".rent-filter_form-block");
          if (panel) panel.style.display = "none";
        }
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
          }, 80);
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
  // converts all CMS prices to IDR first to get a consistent base range.
  // cards with non-IDR prices are skipped if conversion fails (rates not loaded yet).
  // bounds recompute correctly once bhb:rates-ready fires.
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
    if (isFinite(lo) && isFinite(hi)) slider.base = { min: lo, max: hi };
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

  // update quick-select chip labels for selected currency
  function updateChips(currency) {
    var c = normCurrency(currency);
    var presets = CHIP_PRESETS[c] || CHIP_PRESETS["IDR"];
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

    // replace any non-input elements with actual input fields
    var minTextEl = document.getElementById("pwMinText");
    if (minTextEl && minTextEl.tagName !== "INPUT") {
      var minInput = document.createElement("input");
      minInput.type = "text";
      minInput.id = "pwMinText";
      minInput.className = minTextEl.className;
      minInput.inputMode = "numeric";
      minTextEl.parentNode.replaceChild(minInput, minTextEl);
    }
    var maxTextEl = document.getElementById("pwMaxText");
    if (maxTextEl && maxTextEl.tagName !== "INPUT") {
      var maxInput = document.createElement("input");
      maxInput.type = "text";
      maxInput.id = "pwMaxText";
      maxInput.className = maxTextEl.className;
      maxInput.inputMode = "numeric";
      maxTextEl.parentNode.replaceChild(maxInput, maxTextEl);
    }

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
      var children = cmsLocs.filter(function (loc) {
        return rule.keys.includes(loc);
      });
      if (children.length)
        areas.push({ id: rule.id, label: rule.label, children: children });
    }
    state.locations = state.locations.filter(function (loc) {
      return locSet[loc];
    });
  }

  function mountLocUI() {
    if (!el.locDropdown) return;
    var panel = el.locDropdown.querySelector(".location-panel");
    if (!panel) return;
    var leftCol = panel.querySelector(".location-col.is-left");
    if (leftCol && !leftCol.querySelector(".location-col-header")) {
      var sh = document.createElement("div");
      sh.className = "location-col-header";
      sh.textContent = "Search Locations";
      leftCol.insertBefore(sh, leftCol.firstChild);
    }
    if (leftCol && !leftCol.querySelector(".location-popular-label")) {
      var pl = document.createElement("div");
      pl.className = "location-popular-label";
      pl.textContent = "Popular Locations";
      var treeEl = leftCol.querySelector(".tree-scroll");
      if (treeEl) leftCol.insertBefore(pl, treeEl);
    }
    var midCol = panel.querySelector(".location-col.is-middle");
    if (midCol && !midCol.querySelector(".location-col-header")) {
      var mh = document.createElement("div");
      mh.className = "location-col-header";
      mh.textContent = "Property Locations";
      var oldH = midCol.querySelector(".select-locations-header");
      if (oldH) oldH.parentNode.replaceChild(mh, oldH);
      else midCol.insertBefore(mh, midCol.firstChild);
    }
    var lsd = panel.querySelector(".location-search-input");
    if (lsd && lsd.tagName !== "INPUT") {
      var ri = document.createElement("input");
      ri.type = "text";
      ri.placeholder = "Search...";
      ri.className = "location-search-input";
      lsd.parentNode.replaceChild(ri, lsd);
    }
    locUI = {
      searchInput: panel.querySelector(".location-search-input"),
      treeScroll: panel.querySelector(".tree-scroll"),
      pillScroll: panel.querySelector(".pill-scroll"),
      selectedInfo: panel.querySelector("#locSelectedInfo"),
      btnClear: panel.querySelector(".loc-btn-clear-inline"),
      btnApply: panel.querySelector(".loc-btn-apply-inline"),
    };
    if (!locUI.searchInput || !locUI.treeScroll || !locUI.pillScroll) return;
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
    if (!locUI.treeScroll || !locUI.pillScroll) return;
    var q = norm(locUI.searchInput ? locUI.searchInput.value : "");
    var openAreas = {};
    var existingItems = locUI.treeScroll.querySelectorAll(".tree-item");
    for (var x = 0; x < existingItems.length; x++) {
      var pName = existingItems[x].querySelector(".parent-name");
      var cw = existingItems[x].querySelector(".children");
      if (pName && cw && cw.classList.contains("open"))
        openAreas[pName.textContent.trim()] = true;
    }
    locUI.treeScroll.innerHTML = "";
    locUI.pillScroll.innerHTML = "";
    for (var a = 0; a < areas.length; a++) {
      var area = areas[a];
      var areaHit = !q || norm(area.label).indexOf(q) > -1;
      var visKids = area.children.filter(function (c) {
        return areaHit || c.indexOf(q) > -1;
      });
      if (!visKids.length && !areaHit) continue;
      var areaActive = area.children.some(function (c) {
        return draftLocs.indexOf(c) > -1;
      });
      var item = document.createElement("div");
      item.className = "tree-item";
      var parent = document.createElement("div");
      parent.className = "tree-parent" + (areaActive ? " is-active" : "");
      parent.innerHTML =
        '<div class="pin-box"><img src="' +
        PIN_URL +
        '" class="pin-icon" alt=""></div><span class="parent-name">' +
        area.label +
        '</span><div class="tree-chevron"></div>';
      var isOpen =
        openAreas[area.label] ||
        draftLocs.some(function (l) {
          return area.children.indexOf(l) > -1;
        });
      var childWrap = document.createElement("div");
      childWrap.className = isOpen ? "children open" : "children";
      (function (cw) {
        parent.addEventListener("click", function () {
          cw.classList.toggle("open");
        });
      })(childWrap);
      item.appendChild(parent);
      var inner = document.createElement("div");
      inner.className = "children-inner";
      inner.innerHTML = '<div class="branch"></div>';
      var list = document.createElement("div");
      list.className = "child-list";
      for (var k = 0; k < visKids.length; k++) {
        (function (loc) {
          var row = document.createElement("div");
          row.className =
            "child" + (draftLocs.indexOf(loc) > -1 ? " is-active" : "");
          row.innerHTML =
            '<div class="mini-pin-box"><img src="' +
            PIN_URL +
            '" class="pin-icon-sm" alt=""></div><span>' +
            (labelByNorm[loc] || loc) +
            "</span>";
          row.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleLoc(loc);
          });
          list.appendChild(row);
        })(visKids[k]);
      }
      inner.appendChild(list);
      childWrap.appendChild(inner);
      item.appendChild(childWrap);
      locUI.treeScroll.appendChild(item);
      var pill = document.createElement("div");
      pill.className = "pill" + (areaActive ? " is-active" : "");
      pill.textContent = area.label;
      (function (aId) {
        pill.addEventListener("click", function () {
          toggleArea(aId);
        });
      })(area.id);
      locUI.pillScroll.appendChild(pill);
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

  // ─── init ─────────────────────────────────────────────────────────────────

  function init() {
    cacheEls();
    if (!el.grid) return;

    // hide all dropdowns on load
    var allDrops = document.querySelectorAll(
      ".filter-dropdown,.price-dropdown,.location-dropdown",
    );
    for (var i = 0; i < allDrops.length; i++)
      allDrops[i].style.display = "none";

    allCards = Array.from(el.grid.querySelectorAll(CFG.CARD_SEL));
    if (!allCards.length) return;

    areas = [];
    buildAreas();
    mountLocUI();
    computeBaseBounds(); // initial bounds — may exclude non-IDR cards until rates load
    initPricePanel();
    injectDropdownCloseBtns();
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
