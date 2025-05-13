/* ────────────  public/main.js  ──────────── */
/* global L, io, turf */
const socket = io();

/* carte */
const map = L.map('map').setView([50,10],5);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:''}).addTo(map);

let regionLayer, ownership={}, campColors={}, viewerMarkers=new Map();

/* nom lisible */
const niceName = f => f.properties.NAME_LATN || f.properties.NUTS_NAME ||
                      f.properties.NAME      || '(sans nom)';

/* helpers géométrie */
function findPoly(id){
  let poly; regionLayer.eachLayer(l=>{
    if(l.feature.properties.NUTS_ID===id) poly = l.feature;
  }); return poly;
}
function randomInside(poly){
  const bb = turf.bbox(poly);
  for(let i=0;i<25;i++){
    const pt = turf.randomPoint(1,{bbox:bb}).features[0];
    if(turf.booleanPointInPolygon(pt, poly))
      return pt.geometry.coordinates;           // [lon,lat]
  }
  return turf.centroid(poly).geometry.coordinates;
}

/* style région */
function styleOf(id){
  const camp = ownership[id]?.camp;
  return { color:'#444', weight:1,
           fillColor: camp?campColors[camp]:'#2a2d34',
           fillOpacity: camp?0.5:0.25 };
}

/* dessine la couche geojson */
function drawRegions(geo){
  regionLayer = L.geoJSON(geo,{
    style:f=>styleOf(f.properties.NUTS_ID),
    onEachFeature:(f,l)=>{
      l.bindTooltip(`<b>${niceName(f)}</b>`,{sticky:true});
      l.on('mouseover',()=>l.setStyle({weight:3,color:'#f1c40f'}).bringToFront());
      l.on('mouseout', ()=>l.setStyle({weight:1,color:'#444'}));
      l.on('click',    ()=>popup(f,l));
    }
  }).addTo(map);
}

/* recolore une région quand elle change de camp */
function recolor(id,camp){
  ownership[id] = { camp };
  regionLayer.eachLayer(l=>{
    if(l.feature.properties.NUTS_ID===id) l.setStyle(styleOf(id));
  });
}

/* spawn + animation */
function spawn(user,reg,color){
  const poly=findPoly(reg); if(!poly) return;
  const [lon,lat]=randomInside(poly);
  const m=L.circleMarker([lat,lon],{
      radius:4,color:'#000',weight:.4,fillColor:color,fillOpacity:.9
  }).bindTooltip(user);
  m.addTo(map);
  viewerMarkers.set(user,{marker:m,region:reg});
}
function animateMove(user,reg){
  const obj=viewerMarkers.get(user); if(!obj) return;
  const poly=findPoly(reg); if(!poly) return;
  const [lon,lat]=randomInside(poly);
  obj.region=reg;
  const start=obj.marker.getLatLng();
  const steps=30,dur=1000,dx=(lat-start.lat)/steps,dy=(lon-start.lng)/steps;
  let i=0; const t=setInterval(()=>{
    if(++i>=steps){ obj.marker.setLatLng([lat,lon]);clearInterval(t);}
    else obj.marker.setLatLng([start.lat+i*dx,start.lng+i*dy]);
  },dur/steps);
}

/* popup */
function popup(feat,layer){
  const id  = feat.properties.NUTS_ID;
  const camp= ownership[id]?.camp || 'Inoccupé';
  const fighters=[...viewerMarkers.values()].filter(v=>v.region===id).length;
  layer.bindPopup(
    `<div class="card"><h3>${niceName(feat)}</h3>
       <p>ID : ${id}<br>
          Contrôle : <b>${camp}</b><br>
          Combattants : <b>${fighters}</b></p></div>`,
    { className:'region-popup' }).openPopup();
}

/* sockets */
socket.on('init',({regions,game})=>{
  ownership=game.ownership;
  Object.entries(game.camps).forEach(([c,o])=>campColors[c]=o.color);
  drawRegions(regions);
  queueMicrotask(()=>{
    Object.entries(game.viewers)
      .forEach(([u,v])=>spawn(u,v.region,campColors[v.camp]));
  });
});
socket.on('move',d=>animateMove(d.user,d.region));
socket.on('spawn',d=>spawn(d.user,d.region,campColors[d.camp]));
socket.on('regionUpdate',d=>recolor(d.id,d.camp));
socket.on('tick',d=>document.getElementById('tick').textContent=`Tour ${d.tick}`);
