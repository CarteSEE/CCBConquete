/* ───────────────  server.js  ─────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Express from 'express';
import http from 'http';
import { Server } from 'socket.io';

import bbox           from '@turf/bbox';
import bboxPolygon    from '@turf/bbox-polygon';
import booleanOverlap from '@turf/boolean-overlap';
import booleanTouches from '@turf/boolean-touches';

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const PORT       = process.env.PORT || 3000;

const app  = Express();
const httpServer = http.createServer(app);
const io   = new Server(httpServer, { pingInterval: 10_000 });
app.use(Express.static(path.join(__dirname, 'public')));

/* ───── Lecture des régions NUTS2 ───── */
const nuts2   = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'nuts2.geojson')));
const regions = nuts2.features;

/* ───── Graphe d’adjacence ───── */
const adjacency = {};  // { id → Set(voisins) }
regions.forEach(a => {
  const idA = a.properties.NUTS_ID;
  adjacency[idA] = new Set();
  const bbA = bboxPolygon(bbox(a));
  regions.forEach(b => {
    if (a === b) return;
    const bbB = bboxPolygon(bbox(b));
    if (!booleanOverlap(bbA, bbB) && !booleanTouches(bbA, bbB)) return;
    if (booleanTouches(a, b) || booleanOverlap(a, b))
      adjacency[idA].add(b.properties.NUTS_ID);
  });
});

/* ───── État du jeu ───── */
const game = {
  tick: 0,
  viewers: {},   // login → {camp, region, deadUntil}
  camps: {},     // camp → {color, capital, alive}
  ownership: {}  // region → {camp, contestedBy:Set, turnEntered}
};

/* ─────  MODE DÉMO  (NODE_ENV=dev) ───── */
if (process.env.NODE_ENV === 'dev') {
  const demo = [
    { name:'alpha',   color:'#ff9800', capital:'FRK'  }, // Rhône‑Alpes
    { name:'bravo',   color:'#03a9f4', capital:'DE60' }, // Berlin
    { name:'charlie', color:'#8bc34a', capital:'PT15' }  // Algarve
  ];
  demo.forEach(c => {
    game.camps[c.name]  = { color:c.color, capital:c.capital, alive:true };
    game.ownership[c.capital] = { camp:c.name, contestedBy:new Set(), turnEntered:0 };
    for (let i=0;i<30;i++)
      game.viewers[`${c.name}_${i}`] = { camp:c.name, region:c.capital, deadUntil:0 };
  });
}

/* ───── Sockets navigateur ───── */
io.on('connection', sock => {
  sock.emit('init', { regions, game });
});

/* ───── Boucle de tour (30 s) ───── */
setInterval(() => {
  game.tick++;

  /* 1. déplacement aléatoire (75 %) */
  for (const [user, v] of Object.entries(game.viewers)) {
    if (Math.random() < 0.75) {
      const neigh = [...adjacency[v.region] || []];
      if (neigh.length) {
        v.region = neigh[Math.floor(Math.random()*neigh.length)];
        io.emit('move', { user, region:v.region });
      }
    }
  }

  /* 2. annexion si un seul camp présent */
  const presence = {}; // region → {camp→count}
  for (const {camp,region} of Object.values(game.viewers)) {
    (presence[region] ??= {})[camp] = ((presence[region]||{})[camp]||0)+1;
  }
  for (const [reg,camps] of Object.entries(presence)) {
    const campsHere = Object.keys(camps);
    if (campsHere.length === 1) {
      const camp = campsHere[0];
      if (game.ownership[reg]?.camp !== camp) {
        game.ownership[reg] = { camp, contestedBy:new Set(), turnEntered:game.tick };
        io.emit('regionUpdate', { id:reg, camp });
      }
    }
  }

  io.emit('tick', { tick: game.tick });
}, 30_000);

/* ───── Lancement serveur ───── */
httpServer.listen(PORT, () =>
  console.log(`▶  http://localhost:${PORT}  (env=${process.env.NODE_ENV||'prod'})`));
