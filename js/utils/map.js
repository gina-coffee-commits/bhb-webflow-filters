// ─── map utilities ────────────────────────────────────────────────────────

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

function syncMapWith(locs) {
  if (!mapReady || !map) return;
  clearMarkers();
  var bounds = new maptilersdk.LngLatBounds();
  var added = {};
  for (var i = 0; i < allCards.length; i++) {
    var d = getData(allCards[i]);
    if (!d.loc || !LOC_COORDS[d.loc]) continue;
    if (locs.length > 0 && locs.indexOf(d.loc) === -1) continue;
    if (added[d.loc]) continue;
    added[d.loc] = true;
    var coord = LOC_COORDS[d.loc];
    var marker = new maptilersdk.Marker(makePin(d.locRaw))
      .setLngLat(coord)
      .addTo(map);
    markers.push(marker);
    bounds.extend(coord);
  }
  if (markers.length > 0) {
    map.fitBounds(bounds, { padding: 40, maxZoom: 12 });
  }
}