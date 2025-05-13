/* global L, io, turf */
const socket = io();

let map, regionLayer;
const viewerMarkers = new Map();
const campColors = {};      // campName → hex

socket.on('init', ({ regions, adjacency, game }) => {
  game && Object.entries(game.camps).forEach(([name, obj]) => campColors[name] = obj.color);
  initMap(regions, game.ownership);
  // afficher pions existants
  Object.entries(game.viewers).forEach(([u, v]) => addViewerMarker(u, v.region, campColors[v.camp]));
});

socket.on('spawn', ({ user, camp, region }) => addViewerMarker(user, region, campColors[camp]));
socket.on('move',  ({ user, region }) => moveViewer(user, region));
socket.on('tick',  ({ tick }) => (document.getElementById('tick').textContent = `Tour ${tick}`));

/* ─────────────────────────────── */
function initMap(regions, ownership) {
  map = L.map('map').setView([50, 10], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '' }).addTo(map);

  regionLayer = L.geoJSON(regions, {
    style: f => {
      const s = { color:'#444', weight:1, fillOpacity:.25 };
      const owner = ownership[f.properties.NUTS_ID]?.camp;
      if (owner) { s.fillColor = campColors[owner] || '#666'; s.fillOpacity = .45; }
      else       { s.fillColor = '#2a2d34'; }
      return s;
    },
    onEachFeature: (f, layer) => {
      layer.on('mouseover', () => layer.setStyle({ fillOpacity: .5 }));
      layer.on('mouseout',  () => {
        const owner = ownership[f.properties.NUTS_ID]?.camp;
        layer.setStyle({ fillOpacity: owner ? .45 : .25 });
      });
      const name = f.properties.NUTS_NAME || f.properties.NAME_LATN || '---';
      const owner = ownership[f.properties.NUTS_ID]?.camp || 'Inoccupé';
      layer.bindTooltip(`<b>${name}</b><br><small>${f.properties.NUTS_ID}</small><br>${owner}`, {sticky:true});
    }
  }).addTo(map);
}

function addViewerMarker(user, regionId, color) {
  const poly = getRegion(regionId);
  if (!poly) return;
  const [lon, lat] = turf.randomPoint(1, { bbox: turf.bbox(poly) }).features[0].geometry.coordinates;
  const m = L.circleMarker([lat, lon], { radius:4, color:'#000', weight:.5, fillColor:color, fillOpacity:.9 })
              .bindTooltip(user, { permanent:false });
  m.addTo(map);
  viewerMarkers.set(user, { marker:m, region:regionId });
}
function moveViewer(user, regionId) {
  const obj = viewerMarkers.get(user);
  const poly = getRegion(regionId);
  if (!obj || !poly) return;
  const [lon, lat] = turf.randomPoint(1, { bbox: turf.bbox(poly) }).features[0].geometry.coordinates;
  obj.marker.setLatLng([lat, lon]); obj.region = regionId;
}
function getRegion(id) {
  let poly; regionLayer.eachLayer(l => { if (l.feature.properties.NUTS_ID === id) poly = l.feature; });
  return poly;
}
