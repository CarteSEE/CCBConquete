/* public/main.js  ───────────────────────────────────────────*/
const socket = io();

let map, regionLayer;
const viewerMarkers = new Map();   // user → {marker, region}
const campColors    = {};          // camp → color
let ownership       = {};          // id → {camp}

socket.on('init', ({ regions, game }) => {
  ownership = game.ownership;
  Object.entries(game.camps).forEach(([c, obj]) => (campColors[c] = obj.color));

  initMap(regions);
  // pions existants
  Object.entries(game.viewers)
    .forEach(([u, v]) => addViewer(u, v.region, campColors[v.camp]));
});

socket.on('spawn', ({ user, camp, region }) =>
  addViewer(user, region, campColors[camp])
);

socket.on('move', ({ user, region }) => moveViewer(user, region));

socket.on('tick', ({ tick }) =>
  (document.getElementById('tick').textContent = `Tour ${tick}`)
);

/* ─────────── MAP ─────────── */
function initMap(regions) {
  map = L.map('map').setView([50, 10], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
              { attribution: '' }).addTo(map);

  regionLayer = L.geoJSON(regions, {
    style: f => {
      const base  = { color:'#444', weight:1, fillOpacity:.25 };
      const owner = ownership[f.properties.NUTS_ID]?.camp;
      base.fillColor = owner ? campColors[owner] || '#666' : '#2a2d34';
      if (owner) base.fillOpacity = .45;
      return base;
    },
    onEachFeature: (f, layer) => {
      layer.on('mouseover', () => layer.setStyle({ fillOpacity:.55 }));
      layer.on('mouseout', ()  => layer.setStyle({ fillOpacity:
                        ownership[f.properties.NUTS_ID]?.camp ? .45 : .25 }));

      layer.on('click', () => showRegionInfo(f, layer));

      const niceName = f.properties.NUTS_NAME || f.properties.NAME_LATN || '(sans nom)';
      const ownerTxt = ownership[f.properties.NUTS_ID]?.camp || 'Inoccupé';
      layer.bindTooltip(`<b>${niceName}</b><br><small>${f.properties.NUTS_ID}</small><br>${ownerTxt}`,
                        { sticky:true });
    }
  }).addTo(map);
}

function showRegionInfo(feature, layer){
  const id        = feature.properties.NUTS_ID;
  const niceName  = feature.properties.NUTS_NAME || feature.properties.NAME_LATN || '(sans nom)';
  const fighters  = [...viewerMarkers.values()].filter(v => v.region === id).length;
  const ownerTxt  = ownership[id]?.camp || 'Inoccupé';

  layer.bindPopup(
      `<h3 style="margin:0">${niceName}</h3>
       <p>ID : ${id}<br>
       Contrôle : <b>${ownerTxt}</b><br>
       Combattants : <b>${fighters}</b></p>`
  ).openPopup();
}

/* ─────────── PIONS ─────────── */
function addViewer(user, regionId, color) {
  const poly = getPoly(regionId); if (!poly) return;
  const [lon, lat] = turf.randomPoint(1, { bbox: turf.bbox(poly) })
                         .features[0].geometry.coordinates;
  const marker = L.circleMarker([lat, lon], {
      radius:4, color:'#000', weight:.5, fillColor:color, fillOpacity:.9
  }).bindTooltip(user);
  marker.addTo(map);
  viewerMarkers.set(user, { marker, region: regionId });
}

function moveViewer(user, regionId) {
  const obj = viewerMarkers.get(user); if (!obj) return;
  const poly = getPoly(regionId);      if (!poly) return;
  const [lon, lat] = turf.randomPoint(1, { bbox: turf.bbox(poly) })
                         .features[0].geometry.coordinates;
  obj.marker.setLatLng([lat, lon]); obj.region = regionId;
}

function getPoly(id){
  let p; regionLayer.eachLayer(l => { if (l.feature.properties.NUTS_ID === id) p = l.feature; });
  return p;
}
