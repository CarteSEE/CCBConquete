/* ─────────────────────────  public/main.js  ───────────────────────── */
/* global L, io, turf */
const socket        = io();
const viewerMarkers = new Map();          // user → {marker, region}
const campColors    = {};                 // campName → color
let ownership       = {};                 // id → {camp}
let regionLayer; let map;

/* ===== Socket events ===== */
socket.on('init', ({ regions, game }) => {
  ownership = game.ownership;
  Object.entries(game.camps).forEach(([name, obj]) => campColors[name] = obj.color);

  drawMap(regions);
  // Affiche les pions existants
  Object.entries(game.viewers).forEach(([u, v]) =>
      addViewer(u, v.region, campColors[v.camp]));
});

socket.on('spawn', ({ user, camp, region }) =>
  addViewer(user, region, campColors[camp])
);
socket.on('move',  ({ user, region }) => moveViewer(user, region));
socket.on('tick',  ({ tick }) =>
  (document.getElementById('tick').textContent = `Tour ${tick}`)
);

/* ===== Map & regions ===== */
function drawMap(regions) {
  map = L.map('map').setView([50, 10], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              { attribution:'' }).addTo(map);

  regionLayer = L.geoJSON(regions, {
    style: feat => {
      const owner = ownership[feat.properties.NUTS_ID]?.camp;
      return {
        color:'#444', weight:1,
        fillColor: owner ? campColors[owner] : '#2a2d34',
        fillOpacity: owner ? .50 : .25
      };
    },
    onEachFeature: (feat, layer) => {
      layer.on('mouseover', () => layer.setStyle({ fillOpacity:.6 }));
      layer.on('mouseout',  () => layer.setStyle({
        fillOpacity: ownership[feat.properties.NUTS_ID]?.camp ? .5 : .25 }));
      layer.on('click', () => showPopup(feat, layer));

      const name  = feat.properties.NUTS_NAME || feat.properties.NAME_LATN || '(sans nom)';
      const owner = ownership[feat.properties.NUTS_ID]?.camp || 'Inoccupé';
      layer.bindTooltip(`<b>${name}</b><br><small>${feat.properties.NUTS_ID}</small><br>${owner}`,
                        { sticky:true });
    }
  }).addTo(map);
}

function showPopup(feat, layer) {
  const id   = feat.properties.NUTS_ID;
  const name = feat.properties.NUTS_NAME || feat.properties.NAME_LATN || '(sans nom)';
  const camp = ownership[id]?.camp || 'Inoccupé';
  const fighters = [...viewerMarkers.values()].filter(v => v.region === id).length;

  layer.bindPopup(
    `<h3 style="margin:0">${name}</h3>
     <p>ID : ${id}<br>
     Contrôle : <b>${camp}</b><br>
     Combattants : <b>${fighters}</b></p>`
  ).openPopup();
}

/* ===== Viewer markers ===== */
function addViewer(user, regionId, color) {
  const poly = getPoly(regionId); if (!poly) return;
  const [lon, lat] = randomInside(poly);
  const m = L.circleMarker([lat, lon], {
      radius:4, color:'#000', weight:.4, fillColor:color, fillOpacity:.9
  }).bindTooltip(user);
  m.addTo(map);
  viewerMarkers.set(user, { marker:m, region:regionId });
}

function moveViewer(user, regionId) {
  const obj = viewerMarkers.get(user); if (!obj) return;
  const poly = getPoly(regionId);      if (!poly) return;
  const [lon, lat] = randomInside(poly);
  obj.marker.setLatLng([lat, lon]); obj.region = regionId;
}

/* ===== Helpers ===== */
function getPoly(id) {
  let f; regionLayer.eachLayer(l => {
    if (l.feature.properties.NUTS_ID === id) f = l.feature;
  }); return f;
}

// Renvoie un point garanti DANS le polygone (pas seulement la bbox)
function randomInside(polygon) {
  const bbox = turf.bbox(polygon);
  let pt;
  do {
    pt = turf.randomPoint(1, { bbox }).features[0];
  } while (!turf.booleanPointInPolygon(pt, polygon));
  return pt.geometry.coordinates;
}
