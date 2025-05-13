/* global io, L */
// socket --------------------------------------------------------------------
const socket = io();

// map -----------------------------------------------------------------------
const map = L.map("map").setView([20, 0], 2);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 6,
}).addTo(map);

// layers & helpers ----------------------------------------------------------
let regionLayer;
const regionById = Object.create(null);
const soldierMarker = Object.create(null);

function colorRegion(id, color, opacity = 0.5) {
  const layer = regionById[id];
  if (layer) layer.setStyle({ fillColor: color, fillOpacity: opacity });
}

function upsertSoldier(id, latlng, color) {
  let m = soldierMarker[id];
  if (!m) {
    m = L.circleMarker(latlng, {
      radius: 3,
      weight: 0,
      fillColor: color,
      fillOpacity: 0.9,
    }).addTo(map);
    soldierMarker[id] = m;
  } else {
    m.setLatLng(latlng);
  }
}

// popup ---------------------------------------------------------------------
function makePopup(data) {
  return `
  <div class="popup">
    <h4>${data.name}</h4>
    <p><b>Camp&nbsp;:</b> ${data.camp ?? "Aucun"}</p>
    ${
      data.annex
        ? `<p><b>Annexé&nbsp;:</b> tour ${data.annex.turn} par ${data.annex.camp}</p>`
        : "<p>Jamais annexé</p>"
    }
    <p><b>Contesté&nbsp;:</b> ${data.contested ? "Oui" : "Non"}</p>
  </div>`;
}

// load geojson --------------------------------------------------------------
fetch("/nuts2.geojson")
  .then((r) => r.json())
  .then((geo) => {
    regionLayer = L.geoJSON(geo, {
      style: () => ({
        color: "#555",
        weight: 1,
        fillOpacity: 0.2,
      }),
      onEachFeature: (feat, layer) => {
        const id = feat.properties.NUTS_ID;
        regionById[id] = layer;

        layer.bindTooltip(
          feat.properties.name || feat.properties.NAME || id,
          { sticky: true, className: "regtip" }
        );

        layer.on("click", () => {
          socket.emit("requestRegion", id); // (optionnel)
        });
      },
    }).addTo(map);
  });

// HUD -----------------------------------------------------------------------
const hud = document.getElementById("hud");

socket.on("campStats", (stats) => {
  hud.innerHTML = "";
  Object.values(stats).forEach((c) => {
    hud.insertAdjacentHTML(
      "beforeend",
      `<div class="camp">
        <span class="swatch" style="background:${c.color}"></span>
        <span>${c.name}</span>
        <span>Terr.: ${c.territories}</span>
        <span>Sold.: ${c.soldiers}</span>
      </div>`
    );
  });
});

// régions & soldats ---------------------------------------------------------
socket.on("regionUpdate", (evt) => {
  colorRegion(evt.id, evt.color);
});

socket.on("tick", ({ tick, soldiers }) => {
  for (const s of Object.values(soldiers)) {
    const layer = regionById[s.regionId];
    if (!layer) continue;

    if (s.deadUntil > tick) {
      if (soldierMarker[s.id]) soldierMarker[s.id].remove();
      continue;
    }

    const center = layer.getBounds().getCenter();
    upsertSoldier(s.id, center, "#fff");
  }
});

socket.on("popup", (data) => {
  const layer = regionById[data.id];
  if (layer) layer.bindPopup(makePopup(data)).openPopup();
});
