/* ───────────────────────  public/main.js  ─────────────────────── */
/* global L, io, turf */
const socket        = io();
const map           = L.map('map').setView([50,10], 5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:''}).addTo(map);

const campColors    = {};            // camp -> color
const viewerMarkers = new Map();     // user -> {marker,region}
let ownership = {};                  // regionId -> {camp}
let regionLayer;

/* =========== sockets =========== */
socket.on('init', ({ regions, game }) => {
  Object.entries(game.camps).forEach(([c,obj]) => campColors[c]=obj.color);
  ownership = game.ownership;
  drawRegions(regions);

  Object.entries(game.viewers).forEach(([u,v]) =>
      spawnMarker(u,v.region,campColors[v.camp]));
});

socket.on('move',   ({ user, region }) => moveMarker(user, region));
socket.on('spawn',  ({ user, camp, region }) => spawnMarker(user, region, campColors[camp]));
socket.on('regionUpdate', ({ id, camp }) => recolorRegion(id, camp));
socket.on('tick', ({ tick }) =>
    (document.getElementById('tick').textContent = `Tour ${tick}`));

/* =========== régions =========== */
function drawRegions(geo) {
  regionLayer = L.geoJSON(geo, {
    style: f => styleFor(f.properties.NUTS_ID),
    onEachFeature: (feat, layer) => {
      const nm = feat.properties.NUTS_NAME || feat.properties.NAME_LATN || '(sans nom)';
      layer.bindTooltip(`<b>${nm}</b>`, {sticky:true});
      layer.on('click', () => popupRegion(feat, layer));
    }
  }).addTo(map);
}

function styleFor(id){
  const camp = ownership[id]?.camp;
  return {
    color:'#444', weight:1,
    fillColor: camp ? campColors[camp] : '#2a2d34',
    fillOpacity: camp ? .5 : .25
  };
}
function recolorRegion(id,camp){
  ownership[id]={camp};
  regionLayer.eachLayer(l=>{
    if(l.feature.properties.NUTS_ID===id)
      l.setStyle(styleFor(id));
  });
}

/* =========== marquers =========== */
function spawnMarker(user, regionId, color){
  const poly = findPoly(regionId); if(!poly) return;
  const [lon,lat] = randomInside(poly);
  const m = L.circleMarker([lat,lon],{
      radius:4,color:'#000',weight:.4,fillColor:color,fillOpacity:.9
  }).bindTooltip(user);
  m.addTo(map);
  viewerMarkers.set(user,{marker:m,region:regionId});
}
function moveMarker(user, regionId){
  const obj = viewerMarkers.get(user); if(!obj) return;
  const poly = findPoly(regionId);     if(!poly) return;
  const [lon,lat] = randomInside(poly);
  obj.marker.setLatLng([lat,lon]); obj.region = regionId;
}
function randomInside(poly){
  const bb = turf.bbox(poly);
  let pt;
  do{ pt = turf.randomPoint(1,{bbox:bb}).features[0]; }
  while(!turf.booleanPointInPolygon(pt,poly));
  return pt.geometry.coordinates;
}
function findPoly(id){
  let f; regionLayer.eachLayer(l=>{
    if(l.feature.properties.NUTS_ID===id) f=l.feature;
  }); return f;
}

/* =========== popup =========== */
function popupRegion(feat, layer){
  const id  = feat.properties.NUTS_ID;
  const nm  = feat.properties.NUTS_NAME || feat.properties.NAME_LATN || '(sans nom)';
  const camp= ownership[id]?.camp || 'Inoccupé';
  const fighters = [...viewerMarkers.values()].filter(v=>v.region===id).length;

  layer.bindPopup(
    `<div class="infocard">
       <h3>${nm}</h3>
       <p>ID : ${id}<br>
          Contrôle : <b>${camp}</b><br>
          Combattants : <b>${fighters}</b></p>
     </div>`,
    { className:'region-popup' }
  ).openPopup();
}
