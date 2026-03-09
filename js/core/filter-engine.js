// ─── filter engine ────────────────────────────────────────────────────────

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
  btt.onclick = function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  if (el.grid) el.grid.appendChild(btt);
  el.btnBackTop = btt;
}

function updateLoadMore() {
  if (!el.btnLoadMore) return;
  var hasMore = visible < filtered.length;
  el.btnLoadMore.style.display = hasMore ? "" : "none";
  if (el.btnBackTop) {
    el.btnBackTop.style.display = visible > CFG.STEP ? "" : "none";
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

function toggleDrop(drop, trig) {
  var isOpen = drop.style.display !== "none";
  closeAll(isOpen ? null : drop);
  if (!isOpen) {
    drop.style.display = "";
    drop.classList.add("is-open");
    if (trig) trig.classList.add("is-active");
    if (drop === el.locDropdown) locDropOpen = true;
  }
}