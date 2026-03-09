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