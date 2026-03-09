// ─── config ───────────────────────────────────────────────────────────────
var CFG = { GRID_ID: "rentals-wrapper", CARD_SEL: ".w-dyn-item", STEP: 9 };
var MAPTILER_KEY = "c43H8q7pFefMtElMtWBS";
var MAP_STYLE = "019c8e23-ebd1-7221-bd5f-20ae2dca2ab6";
var PIN_URL =
  "https://cdn.prod.website-files.com/67344ae68adf4fc1f539002d/69a009335d3c16a421dd917a_Icon.svg";

// ─── AREA RULES ──────────────────────────────────────────────────────────────

var AREA_RULES = [
  {
    id: "canggu-area",
    label: "Canggu area",
    keys: [
      "canggu",
      "pererenan",
      "seseh",
      "cemagi",
      "buduk",
      "kaba kaba",
      "kaba-kaba",
      "cepaka",
      "tumbak bayuh",
      "buwit",
      "dalung"
    ]
  },
  {
    id: "uluwatu-area",
    label: "Uluwatu area",
    keys: [
      "bingin",
      "uluwatu",
      "uluwatu center",
      "ungasan"
    ]
  },
  {
    id: "ubud-area",
    label: "Ubud area",
    keys: [
      "ubud",
      "ubud center"
    ]
  },
  {
    id: "tabanan-area",
    label: "Tabanan area",
    keys: [
      "kedungu",
      "nyanyi",
      "pandak gede",
      "nyambu",
      "tanah lot"
    ]
  }
];

// ─── LOCATION COORDINATES ────────────────────────────────────────────────────
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