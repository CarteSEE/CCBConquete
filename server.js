/* ─────────────────────  server.js  ───────────────────── */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Express from 'express';
import { Server } from 'socket.io';
import http from 'http';

/* Turf – tests topologiques et bbox rapides */
import booleanOverlap from '@turf/boolean-overlap';
import booleanTouches from '@turf/boolean-touches';
import bbox           from '@turf/bbox';
import bboxPolygon    from '@turf/bbox-polygon';

/* Twitch */
import tmi from 'tmi.js';
const USE_TWITCH = process.env.NODE_ENV !== 'dev';   // false quand tu fais npm run dev

/* ───── Config rapides ──── */
const PORT       = process.env.PORT || 3000;
const TW_CHANNEL = process.env.TW_CHANNEL || 'your_channel';
const TW_OAUTH   = process.env.TW_OAUTH   || 'oauth:XXXXXXXXXXXX';

/* ───── Express + Socket.IO ──── */
const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const app        = Express();
const httpServer = http.createServer(app);
const io         = new Server(httpServer, { pingInterval: 10_000 });

app.use(Express.static(path.join(__dirname, 'public')));

/* ───── 1. Charge GeoJSON et calcule l’adjacence fiable ──── */
const nuts2   = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'nuts2.geojson')));
const regions = nuts2.features;

const adjacency = {};                          // { NUTS_ID → Set<voisins> }
for (const featA of regions) {
  const idA   = featA.properties.NUTS_ID;
  const bbA   = bboxPolygon(bbox(featA));      // polygone BBox pour filtre rapide
  adjacency[idA] = new Set();

  for (const featB of regions) {
    if (featA === featB) continue;
    const idB = featB.properties.NUTS_ID;

    // 1) filtre BBox : 95 % des cas écartés ici
    const bbB = bboxPolygon(bbox(featB));
    if (!booleanOverlap(bbA, bbB) && !booleanTouches(bbA, bbB)) continue;

    // 2) test topologique précis
    if (booleanTouches(featA, featB) || booleanOverlap(featA, featB)) {
      adjacency[idA].add(idB);
    }
  }
}

/* ───── 2. État de jeu minimal ──── */
const game = {
  tick      : 0,
  viewers   : {},           // { login: {camp, region, deadUntil} }
  camps     : {},           // { campName: {color, capital, alive} }
  ownership : {}            // { regionId → {camp|contested, turnEntered} }
};

game.camps[TW_CHANNEL] = { color: '#E91E63', capital: 'FRK', alive: true };
game.ownership['FRK']  = { camp: TW_CHANNEL, contestedBy: new Set(), turnEntered: 0 };

// ───── MODE DÉMO — uniquement quand NODE_ENV=dev ─────
if (process.env.NODE_ENV === 'dev') {
  const demoCamps = [
    { name: 'alpha',   color: '#ff9800', capital: 'FRK'  }, // Rhône‑Alpes
    { name: 'bravo',   color: '#03a9f4', capital: 'DE60' }, // Berlin
    { name: 'charlie', color: '#8bc34a', capital: 'PT15' }  // Algarve
  ];

  demoCamps.forEach(c => {
    game.camps[c.name]  = { color: c.color, capital: c.capital, alive: true };
    game.ownership[c.capital] = { camp: c.name, contestedBy: new Set(), turnEntered: 0 };

    // 30 viewers dans la capitale de leur camp
    for (let i = 0; i < 30; i++) {
      game.viewers[`${c.name}_${i}`] = { camp: c.name, region: c.capital, deadUntil: 0 };
    }
  });
}

/* ───── 3. Sockets navigateur ──── */
io.on('connection', sock => {
  sock.emit('init', { regions, adjacency, game });
});

/* ───── 4. Bot Twitch ──── */
if (USE_TWITCH) {
  const twitch = new tmi.Client({
    options : { debug: false },
    identity: { username: 'bot_name', password: TW_OAUTH },
    channels: [TW_CHANNEL]
  });
  twitch.connect();

  /* commande “jouer” et “go <ID>” */
  twitch.on('message', (ch, tags, msg) => {
    const user = tags['display-name']?.toLowerCase();
    const v    = game.viewers[user];

    if (msg.trim().toLowerCase() === 'jouer' && !v) {
      const spawn = game.camps[TW_CHANNEL].capital;
      game.viewers[user] = { camp: TW_CHANNEL, region: spawn, deadUntil: 0 };
      io.emit('spawn', { user, camp: TW_CHANNEL, region: spawn });
    }
  if (msg.toLowerCase().startsWith('go ')) {
    const target = msg.split(' ')[1]?.toUpperCase();
    if (v && game.tick >= v.deadUntil && adjacency[v.region]?.has(target)) {
      v.region = target;
      io.emit('move', { user, region: target });
    }
  }
  });
}
/* ───── Tick : 30 s ──── */
// ───── Boucle de jeu : 1 tour toutes les 30 s ─────
setInterval(() => {
  game.tick += 1;

  /* 1. Mouvement aléatoire (75 % de chance) */
  for (const [user, v] of Object.entries(game.viewers)) {
    if (Math.random() < 0.75) {
      const voisins = [...(adjacency[v.region] || [])];
      if (voisins.length) {
        const dest = voisins[Math.floor(Math.random() * voisins.length)];
        v.region = dest;
        io.emit('move', { user, region: dest });
      }
    }
  }

  /* 2. Annexion : si une seule armée présente dans la région */
  const presence = {};                 // region → { camp → nombre }
  for (const { camp, region } of Object.values(game.viewers)) {
    presence[region] ??= {};
    presence[region][camp] = (presence[region][camp] || 0) + 1;
  }

  for (const [regionId, camps] of Object.entries(presence)) {
    const campsPrésents = Object.keys(camps);
    if (campsPrésents.length === 1) {
      const uniqueCamp = campsPrésents[0];
      if (game.ownership[regionId]?.camp !== uniqueCamp) {
        game.ownership[regionId] = {
          camp: uniqueCamp,
          contestedBy: new Set(),
          turnEntered: game.tick
        };
        io.emit('regionUpdate', { id: regionId, camp: uniqueCamp });
      }
    }
  }

  io.emit('tick', { tick: game.tick });
}, 30_000);


/* ───── GO ──── */
httpServer.listen(PORT, () => console.log(`▶  http://localhost:${PORT}`));
