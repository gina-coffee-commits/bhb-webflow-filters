# bhb-webflow-filters

Custom JavaScript filters for the [Bali Home Base](https://balihomebase.com) Webflow site. Three independent filter scripts — one per listings page — plus shared CSS.

---

## Files

```
js/
  filter.js          → Rentals page
  villas-filter.js   → Villas page
  lands-filter.js    → Lands page
css/
  filter.css         → Shared styles (dropdowns, slider, map, chips)
```

---

## CDN URLs (jsDelivr)

```html
<!-- Rentals -->
<script src="https://cdn.jsdelivr.net/gh/USERNAME/bhb-webflow-filters@main/js/filter.js"></script>

<!-- Villas -->
<script src="https://cdn.jsdelivr.net/gh/USERNAME/bhb-webflow-filters@main/js/villas-filter.js"></script>

<!-- Lands -->
<script src="https://cdn.jsdelivr.net/gh/USERNAME/bhb-webflow-filters@main/js/lands-filter.js"></script>

<!-- CSS (add to <head>) -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/USERNAME/bhb-webflow-filters@main/css/filter.css">
```

Replace `USERNAME` with your GitHub username.

> **Cache note:** jsDelivr caches aggressively. To bust cache after an update, use a version tag instead of `@main`:
> `@v1.0.1` → bump the tag on each release.

---

## Features

All three filters share the same core architecture:

| Feature | Rentals | Villas | Lands |
|---|---|---|---|
| Price slider + chips | ✅ | ✅ | ✅ |
| Currency switcher (IDR/USD/EUR) | ✅ | ✅ | ✅ |
| Location map (MapTiler) | ✅ | ✅ | ✅ |
| Keyword search | ✅ | ✅ | ✅ |
| Load more + back to top | ✅ | ✅ | ✅ |
| Availability (Available/Rented) | ✅ | — | — |
| Bedrooms | ✅ | ✅ | — |
| Ownership (Leasehold/Freehold) | — | ✅ | ✅ |
| Lease duration | — | ✅ | ✅ |
| Land size | — | — | ✅ |
| Price per are | — | — | ✅ |

---

## Data Attributes

Each listing card wrapper (`.listings_card-wrapper`) needs these attributes set in Webflow CMS:

**Rentals**
```
data-name             → listing name
data-code             → listing code / ID
data-location         → location name (e.g. "Canggu")
data-rooms            → number of bedrooms (integer)
data-price            → price in listing currency
data-currency         → IDR | USD | EUR
data-available-date   → availability date string
```

**Villas**
```
data-name
data-code
data-location
data-rooms
data-price
data-currency
data-available        → "Leasehold" | "Freehold"
```
Lease years are read from `.leasehold-year-container .u-txt-bold` in the card DOM.

**Lands**
```
data-name
data-code
data-location
data-size             → land size in are (m²)
data-price-are        → price per are (primary)
data-price-total      → total price (fallback if data-price-are missing)
data-currency
data-available        → "Leasehold" | "Freehold"
```
Lease years are read from `.leasehold-year-container .u-txt-bold`.

---

## Area Groups

Locations are grouped into areas for the map and location picker:

| Area | Locations |
|---|---|
| Canggu area | Canggu, Pererenan, Seseh, Cemagi, Kaba Kaba, Cepaka, Tumbak Bayuh, Buwit, Dalung |
| Uluwatu area | Bingin, Uluwatu, Uluwatu Center, Ungasan |
| Ubud area | Ubud, Ubud Center |
| Tabanan area | Kedungu, Nyanyi, Pandak Gede, Nyambu, Tanah Lot |

To add a new location, add it to the relevant `keys` array in `AREA_RULES` and add its coordinates to `LOC_COORDS` inside the JS file.

---

## Price Chips

**Rentals & Villas**
| Currency | Low | Mid | High |
|---|---|---|---|
| IDR | < Rp3B | Rp3B – Rp10B | > Rp10B |
| USD | < $250k | $250k – $600k | > $600k |
| EUR | < €250k | €250k – €600k | > €600k |

**Lands (price per are)**
| Currency | Low | Mid | High |
|---|---|---|---|
| IDR | < Rp8jt/are | Rp8jt – Rp15jt/are | > Rp15jt/are |
| USD | < $500/are | $500 – $950/are | > $950/are |
| EUR | < €450/are | €450 – €900/are | > €900/are |

---

## Required DOM IDs

| ID | Used by |
|---|---|
| `rentals-wrapper` | Rentals grid container |
| `villas-wrapper` | Villas grid container |
| `lands-wrapper` | Lands grid container |
| `rental-results-count` | Result count display (all pages) |
| `rental-empty-state` | Empty state element (all pages) |
| `load-more` | Load more button (rentals, lands) |
| `bhbMap` | Map container inside location dropdown |
| `pwFill` | Slider fill bar |
| `pwMin` / `pwMax` | Native range inputs (hidden) |
| `pwMinText` / `pwMaxText` | Price text inputs |
| `pwRangeText` | Price range label |
| `pwScaleMin` / `pwScaleMax` | Slider scale labels |

Villas load more uses class `.villas-load-more` instead of an ID.

---

## Filter Panel Selectors

| Page | Panel class |
|---|---|
| Rentals | `.rent-filter_form-block` |
| Villas | `.villas-filter_form-block` |
| Lands | `.rent-filter_form-block` |

---

## Currency Conversion

The scripts call `window.debugCurrency.convertAmount(amount, from, to)` and `window.debugCurrency.setCurrency(c)` if available. Hook your site's currency switcher into these to get live conversion on the price slider and chips.

---

## Updating

1. Edit the JS/CSS file locally
2. Commit and push to `main`
3. Create a new git tag: `git tag v1.x.x && git push --tags`
4. Update the jsDelivr URL in Webflow to the new tag

---

## Dependencies

- [MapTiler SDK JS v3.10.2](https://docs.maptiler.com/sdk-js/) — loaded dynamically, no install needed
- No other external dependencies