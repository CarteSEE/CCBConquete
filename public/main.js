/* ─────────────  public/main.js  ───────────── */
/* global L, io, turf */

const socket = io();

/* ---------- carte ---------- */
const map = L.map("map").setView([50, 10], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: ""
}).addTo(map);

let regionLayer;
const campColors = {};             // campId → color
const ownership = {};              // regionId → campId | undefined
const soldierMarkers = new Map();  // soldierId → {marker, regionId}

/* ---------- helpers ---------- */
const niceName = f =>
  f.properties.NAME_LATN ||
  f.properties.NUTS_NAME ||
  f.properties.NAME ||
  "(sans nom)";

function findPoly(id) {
  let poly;
  regionLayer?.eachLayer(l => {
    if (l.feature.properties.NUTS_ID === id) poly = l.feature;
  });
  return poly;
}

function randomInside(poly) {
  const bb = turf.bbox(poly);
  for (let i = 0; i < 25; i++) {
    const pt = turf.randomPoint(1, { bbox: bb }).features[0];
    if (turf.booleanPointInPolygon(pt, poly))
      return pt.geometry.coordinates; // [lon,lat]
  }
  return turf.centroid(poly).geometry.coordinates;
}

function styleOf(id) {
  const camp = ownership[id];
  return {
    color: "#444",
    weight: 1,
    fillColor: camp ? campColors[camp] : "#2a2d34",
    fillOpacity: camp ? 0.5 : 0.25
  };
}

function drawRegions(geo) {
  regionLayer = L.geoJSON(geo, {
    style: f => styleOf(f.properties.NUTS_ID),
    onEachFeature: (f, l) => {
      l.bindTooltip(`<b>${niceName(f)}</b>`, { sticky: true });
      l.on("mouseover", () =>
        l.setStyle({ weight: 3, color: "#f1c40f" }).bringToFront()
      );
      l.on("mouseout", () => l.setStyle({ weight: 1, color: "#444" }));
    }
  }).addTo(map);
}

/* ---------- soldats ---------- */
function spawnSoldier(id, soldier, instant = false) {
  const poly = findPoly(soldier.regionId);
  if (!poly) return;
  const [lon, lat] = randomInside(poly);
  const m = L.circleMarker([lat, lon], {
    radius: 4,
    color: "#000",
    weight: 0.4,
    fillColor: campColors[soldier.campId],
    fillOpacity: 0.9
  }).bindTooltip(id);
  m.addTo(map);
  soldierMarkers.set(id, { marker: m, regionId: soldier.regionId });
  if (!instant) animateMove(id, soldier.regionId);
}

function animateMove(id, newRegionId) {
  const obj = soldierMarkers.get(id);
  if (!obj || obj.regionId === newRegionId) return;
  const poly = findPoly(newRegionId);
  if (!poly) return;
  const [lon, lat] = randomInside(poly);
  obj.regionId = newRegionId;
  const start = obj.marker.getLatLng();
  const steps = 25,
    dur = 800,
    dx = (lat - start.lat) / steps,
    dy = (lon - start.lng) / steps;
  let i = 0;
  const t = setInterval(() => {
    if (++i >= steps) {
      obj.marker.setLatLng([lat, lon]);
      clearInterval(t);
    } else {
      obj.marker.setLatLng([start.lat + i * dx, start.lng + i * dy]);
    }
  }, dur / steps);
}

/* ---------- régions ---------- */
function recolorRegion(id, camp) {
  ownership[id] = camp;
  regionLayer.eachLayer(l => {
    if (l.feature.properties.NUTS_ID === id) l.setStyle(styleOf(id));
  });
}

/* ---------- socket events ---------- */

socket.on("init", async init => {
  // couleurs des camps
  Object.entries(init.camps).forEach(([id, c]) => (campColors[id] = c.color));

  // charge GeoJSON client‑side (plus léger côté serveur)
  const geo = await fetch("/nuts2.geojson").then(r => r.json());
  drawRegions(geo);

  // ownership initial
  Object.entries(init.regions).forEach(([id, data]) => {
    const owners = data.owners;
    if (owners.length) ownership[id] = owners[owners.length - 1][0];
  });
  Object.keys(ownership).forEach(id => recolorRegion(id, ownership[id]));

  // soldats initiaux
  Object.entries(init.soldiers).forEach(([id, s]) => spawnSoldier(id, s, true));

  document.getElementById("tick").textContent = `Tour ${init.tick}`;
});

socket.on("tick", ev => {
  document.getElementById("tick").textContent = `Tour ${ev.tick}`;

  // mises à jour régions
  Object.entries(ev.regions).forEach(([id, data]) => {
    const owners = data.owners;
    const camp = owners.length ? owners[owners.length - 1][0] : undefined;
    if (ownership[id] !== camp) recolorRegion(id, camp);
  });

  // déplacements soldats
  Object.entries(ev.soldiers).forEach(([id, s]) => {
    if (!soldierMarkers.has(id)) {
      spawnSoldier(id, s, true);
    } else {
      animateMove(id, s.regionId);
    }
  });
});