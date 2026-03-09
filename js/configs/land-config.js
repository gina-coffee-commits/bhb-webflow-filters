// ─── CONFIG ──────────────────────────────────────────────────────────────────

var CFG = {
  GRID_ID: 'land-wrapper',
  CARD_SEL: '.w-dyn-item',
  STEP: 9
};

var MAPTILER_KEY = 'c43H8q7pFefMtElMtWBS';
var MAP_STYLE    = '019c8e23-ebd1-7221-bd5f-20ae2dca2ab6';
var PIN_URL      = 'https://cdn.prod.website-files.com/67344ae68adf4fc1f539002d/69a009335d3c16a421dd917a_Icon.svg';
var FILTER_PANEL = '.rent-filter_form-block';

// ─── AREA RULES ──────────────────────────────────────────────────────────────

var AREA_RULES = [
  { id: 'uluwatu-area', label: 'Uluwatu area', keys: ['uluwatu', 'ungasan', 'pecatu'] },
  { id: 'canggu-area',  label: 'Canggu area',  keys: ['canggu', 'batu bolong', 'dalung', 'pererenan', 'tumbak bayuh', 'buduk', 'cemagi', 'seseh'] },
  { id: 'tabanan-area', label: 'Tabanan area', keys: ['kedungu', 'nyanyi', 'tanah lot', 'cepaka', 'buwit', 'kaba kaba', 'kaba-kaba'] },
  { id: 'ubud-area',    label: 'Ubud area',    keys: ['ubud'] }
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

// ─── PRICE CHIP PRESETS (per are) ────────────────────────────────────────────

var CHIP_PRESETS = {
  IDR: [
    { label: '< Rp8jt/are',              min: 0,        max: 8000000  },
    { label: 'Rp8jt \u2013 Rp15jt/are',  min: 8000000,  max: 15000000 },
    { label: '> Rp15jt/are',             min: 15000000, max: null     }
  ],
  USD: [
    { label: '< $500/are',               min: 0,   max: 500  },
    { label: '$500 \u2013 $950/are',      min: 500, max: 950  },
    { label: '> $950/are',               min: 950, max: null }
  ],
  EUR: [
    { label: '< \u20ac450/are',                       min: 0,   max: 450  },
    { label: '\u20ac450 \u2013 \u20ac900/are',         min: 450, max: 900  },
    { label: '> \u20ac900/are',                        min: 900, max: null }
  ]
};