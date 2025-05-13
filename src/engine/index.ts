import { readFileSync } from "fs";
import path from "path";
import { Server } from "socket.io";
import { applyRandomMove } from "./movement";
import { resolveCombat } from "./combat";
import { updateOwnership } from "./capture";
import {
  Camp,
  GameState,
  Region,
  Soldier,
} from "./types";                     // <-- ton fichier de types

const TICK_MS = 5_000;

/* ---------------------------------------------------------- */
/*  CRÉATION DE L’ENGINE                                      */
/* ---------------------------------------------------------- */
export function createEngine(io: Server) {
  /* 1. Charger les fichiers statiques ---------------------- */
  const geo = JSON.parse(
    readFileSync(path.join(__dirname, "..", "..", "public", "nuts2.geojson"), "utf-8")
  );
  const graph: Record<string, string[]> = JSON.parse(
    readFileSync(path.join(__dirname, "..", "..", "public", "nuts2-adj.json"), "utf-8")
  );

  /* 2. Bâtir le GameState ---------------------------------- */
  const state: GameState = {
    tick: 0,
    camps: {},
    regions: {},
    soldiers: {},
    graph,
    io,
  };

  for (const feat of geo.features) {
    state.regions[feat.properties.NUTS_ID] = {
      id: feat.properties.NUTS_ID,
      name: feat.properties.name || feat.properties.NAME || "",
      owners: new Map(),
      contestedBy: new Set(),
    } as Region;
  }

  /* 3. Peupler une démo avec 3 camps ------------------------ */
  seedDemo(state, geo.features);

  /* 4. Lancer la boucle de jeu ----------------------------- */
  setInterval(() => step(state), TICK_MS);

  return { getState: () => state };
}

/* ---------------------------------------------------------- */
/*  BOUCLE DE JEU                                             */
/* ---------------------------------------------------------- */
function step(state: GameState) {
  state.tick++;

  applyRandomMove(state);
  resolveCombat(state);
  updateOwnership(state);

  /* 4. Diffuser la frame courante -------------------------- */
  state.io.emit("tick", {
    tick: state.tick,
    soldiers: state.soldiers,
  });

  /* 5. Mettre à jour le HUD -------------------------------- */
  const campStats = Object.fromEntries(
    Object.values(state.camps).map((c) => [
      c.id,
      {
        name: c.name,
        color: c.color,
        territories: Object.values(state.regions).filter((r) =>
          r.owners.has(c.id)
        ).length,
        soldiers: Object.values(state.soldiers).filter(
          (s) => s.campId === c.id && s.deadUntil <= state.tick
        ).length,
      },
    ])
  );
  state.io.emit("campStats", campStats);
}

/* ---------------------------------------------------------- */
/*  DÉMO : 3 capitales éloignées + 90 soldats chacune          */
/* ---------------------------------------------------------- */
const rand = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a: any, b: any) =>
  Math.hypot(
    a.properties.longitude - b.properties.longitude,
    a.properties.latitude - b.properties.latitude
  );

function seedDemo(state: GameState, features: any[]) {
  const first = rand(features);
  const farEnough = features.filter((f) => dist(f, first) > 30);
  const second = rand(farEnough);
  const third = [...farEnough]
    .sort(
      (a, b) =>
        Math.min(dist(a, first), dist(a, second)) -
        Math.min(dist(b, first), dist(b, second))
    )
    .pop()!;

  const picks = [first, second, third];
  const colors = ["#e74c3c", "#27ae60", "#2980b9"];

  picks.forEach((cap, idx) => {
    const cid = `camp${idx}`;

    state.camps[cid] = {
      id: cid,
      name: `Camp ${idx + 1}`,
      color: colors[idx],
      capitalId: cap.properties.NUTS_ID,
    } as Camp;

    state.regions[cap.properties.NUTS_ID].owners.set(cid, {
      campId: cid,
      turnEntered: 0,
    });

    for (let s = 0; s < 90; s++) {
      const sid = `${cid}-s${s}`;
      state.soldiers[sid] = {
        id: sid,
        username: sid,
        campId: cid,
        regionId: cap.properties.NUTS_ID,
        hp: 3,
        deadUntil: 0,
      } as Soldier;
    }
  });
}
