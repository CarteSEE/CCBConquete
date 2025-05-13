/* ─────────────  public/main.js  ───────────── */
/* global L, io, turf */

const socket = io();

/* ---------- variables globales ---------- */
let regionLayer;
const campColors = {};            // campId → color
const campsData = {};             // campId → {name,color,capitalId}
let regionData = {};              // régionId → {owners, contestedBy}
const soldierMarkers = new Map(); // soldierId → {marker, regionId}
let currentTick = 0;

/* ---------- carte ---------- */
const map = L.map("map").setView([50, 10], 5);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "" }).addTo(map);

/* helpers --------------------------------------------------- */
const niceName = f =>
  f.properties.NAME_LATN || f.properties.NUTS_NAME || f.properties.NAME || "(sans nom)";

function findPoly(id) {
  let poly;
  regionLayer?.eachLayer(l => { if (l.feature.properties.NUTS_ID === id) poly = l.feature; });
  return poly;
}

function randomInside(poly) {
  const bb = turf.bbox(poly);
  for (let i = 0; i < 25; i++) {
    const pt = turf.randomPoint(1, { bbox: bb }).features[0];
    if (turf.booleanPointInPolygon(pt, poly)) return pt.geometry.coordinates; // [lon,lat]
  }
  return turf.centroid(poly).geometry.coordinates;
}

function styleOf(id) {
  const camp = getOwner(id);
  return {
    color: "#444", weight: 1,
    fillColor: camp ? campColors[camp] : "#2a2d34",
    fillOpacity: camp ? 0.5 : 0.25
  };
}

function getOwner(id) {
  const reg = regionData[id];
  if (!reg || !reg.owners.length) return undefined;
  return reg.owners[reg.owners.length - 1][0]; // campId
}

/* ---------- régions ---------- */
function drawRegions(geo) {
  regionLayer = L.geoJSON(geo, {
    style: f => styleOf(f.properties.NUTS_ID),
    onEachFeature: (f, l) => {
      l.bindTooltip(`<b>${niceName(f)}</b>`, { sticky: true });
      l.on("mouseover", () => l.setStyle({ weight: 3, color: "#f1c40f" }).bringToFront());
      l.on("mouseout", () => l.setStyle({ weight: 1, color: "#444" }));
      l.on("click", e => showTerritoryPopup(f, e.latlng));
    }
  }).addTo(map);
}

function recolorRegion(id) {
  regionLayer.eachLayer(l => {
    if (l.feature.properties.NUTS_ID === id) l.setStyle(styleOf(id));
  });
}

function showTerritoryPopup(f, latlng) {
  const id = f.properties.NUTS_ID;
  const reg = regionData[id];
  const ownerId = getOwner(id);
  const contested = reg.contestedBy?.length > 0;
  const annexTxt = ownerId ? `Annexé tour ${reg.owners[reg.owners.length - 1][1]}` : "Jamais annexé";
  const html = `
    <div>
      <h4>${niceName(f)}</h4>
      <p>Camp : <b>${ownerId ? campsData[ownerId].name : "Aucun"}</b></p>
      <p>${annexTxt}</p>
      <p>Contesté : <b>${contested ? "Oui" : "Non"}</b></p>
    </div>`;
  L.popup({ className: "territory-popup" }).setLatLng(latlng).setContent(html).openOn(map);
}

/* ---------- soldats ---------- */
function spawnSoldier(id, soldier, instant = false) {
  const poly = findPoly(soldier.regionId);
  if (!poly) return;
  const [lon, lat] = randomInside(poly);
  const m = L.circleMarker([lat, lon], {
    radius: 4, color: "#000", weight: 0.4,
    fillColor: campColors[soldier.campId], fillOpacity: 0.9
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
  const steps = 25, dur = 800,
    dx = (lat - start.lat) / steps, dy = (lon - start.lng) / steps;
  let i = 0;
  const t = setInterval(() => {
    if (++i >= steps) { obj.marker.setLatLng([lat, lon]); clearInterval(t); }
    else { obj.marker.setLatLng([start.lat + i * dx, start.lng + i * dy]); }
  }, dur / steps);
}

/* ---------- HUD ---------- */
function updateHud(soldiers) {
  const hud = document.getElementById("hud");
  hud.innerHTML = `<div style="margin-bottom:6px;font-weight:bold;">Tour ${currentTick}</div>`;
  Object.entries(campsData).forEach(([id, camp]) => {
    const territories = Object.values(regionData).filter(r => {
      const o = r.owners; return o.length && o[o.length - 1][0] === id;
    }).length;
    const alive = Object.values(soldiers).filter(s => s.campId === id && s.deadUntil <= currentTick).length;
    const row = document.createElement("div"); row.className = "camp-row";
    row.innerHTML = `
      <span class="camp-color" style="background:${camp.color}"></span>
      <span>${camp.name}</span>
      <span style="margin-left:auto;">${territories} 🔷 / ${alive} ⚔︎</span>`;
    hud.appendChild(row);
  });
}

/* ---------- socket events ---------- */

socket.on("init", async init => {
  currentTick = init.tick;
  Object.assign(campColors, Object.fromEntries(Object.entries(init.camps).map(([id,c]) => [id,c.color])));
  Object.assign(campsData, init.camps);
  regionData = init.regions;

  // charge GeoJSON
  const geo = await fetch("/nuts2.geojson").then(r => r.json());
  drawRegions(geo);

  Object.entries(init.soldiers).forEach(([id, s]) => spawnSoldier(id, s, true));
  updateHud(init.soldiers);
});

socket.on("tick", ev => {
  currentTick = ev.tick;
  regionData = ev.regions;

  // mouvements soldats
  Object.entries(ev.soldiers).forEach(([id, s]) => {
    if (!soldierMarkers.has(id)) spawnSoldier(id, s, true);
    else animateMove(id, s.regionId);
  });

  // recolorations
  Object.keys(ev.regions).forEach(id => recolorRegion(id));
  updateHud(ev.soldiers);
});
