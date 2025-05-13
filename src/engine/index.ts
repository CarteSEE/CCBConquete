/* ------------------------------------------------- */
/* File: src/engine/index.ts                         */
/* ------------------------------------------------- */
import { Server as IOServer } from "socket.io";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import bbox from "@turf/bbox";
import bboxPolygon from "@turf/bbox-polygon";
import booleanOverlap from "@turf/boolean-overlap";
import booleanTouches from "@turf/boolean-touches";

import { GameState, Camp, Region, Soldier } from "./types.js";
import { applyRandomMove } from "./movement.js";
import { resolveCombat } from "./combat.js";
import { updateOwnership } from "./capture.js";
import { randomChoice } from "../utils/random.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TICK_INTERVAL_MS = 5_000;

export function createEngine(io: IOServer) {
  const state = buildInitialState(io);
  let timer: NodeJS.Timeout | null = null;

  function start() {
    if (timer) return;
    timer = setInterval(step, TICK_INTERVAL_MS);
  }

  function step() {
    state.tick += 1;

    applyRandomMove(state);
    resolveCombat(state);
    updateOwnership(state);

    io.emit("tick", {
      tick: state.tick,
      soldiers: state.soldiers,
      regions: serializeRegions(state),
    });
  }

  start();

  return {
    state,
    io,
  };
}

function buildInitialState(io: IOServer): GameState {
  const nuts2 = JSON.parse(
    readFileSync(path.join(__dirname, "..", "..", "public", "nuts2.geojson"), "utf-8")
  );
  const features: any[] = nuts2.features;

  /* ---- graphe d’adjacence ---- */
  const graph = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "public", "nuts2-adj.json"), "utf-8"));
  for (const a of features) {
    const neigh: string[] = [];
    for (const b of features) {
      if (a === b) continue;
      if (booleanOverlap(a, b) || booleanTouches(bboxPolygon(bbox(a)), bboxPolygon(bbox(b)))) {
        neigh.push(b.properties.NUTS_ID);
      }
    }
    graph[a.properties.NUTS_ID] = neigh;
  }

  /* ---- camps de démo ---- */
  const campIds = ["A", "B", "C"] as const;
  const colors = ["#e74c3c", "#2980b9", "#27ae60"];
  const camps: Record<string, Camp> = {};
  const regionList = features.map(f => f.properties.NUTS_ID);

  campIds.forEach((id, i) => {
    camps[id] = {
      id,
      name: `Camp ${id}`,
      color: colors[i],
      capitalId: regionList[i % regionList.length],
      alive: true,
    };
  });

  /* ---- régions ---- */
  const regions: Record<string, Region> = {};
  regionList.forEach(id =>
    (regions[id] = { id, owners: new Map(), contestedBy: new Set() })
  );

  /* ---- soldats ---- */
  const soldiers: Record<string, Soldier> = {};
  let sId = 0;
  campIds.forEach(campId => {
    for (let i = 0; i < 30; i++) {
      const reg = camps[campId].capitalId;
      const id = `S${sId++}`;
      soldiers[id] = {
        id,
        username: `bot_${id}`,
        campId,
        regionId: reg,
        hp: 3,
        deadUntil: 0,
      };
    }
  });

  /* ---- handshake init ---- */
  io.on("connection", socket => {
    socket.emit("init", {
      tick: 0,
      camps,
      soldiers,
      regions: serializeRegions({ regions }),
    });
  });

  return {
    tick: 0,
    camps,
    regions,
    soldiers,
    graph,
  };
}

function serializeRegions(state: Pick<GameState, "regions">) {
  return Object.fromEntries(
    Object.entries(state.regions).map(([id, r]) => [
      id,
      {
        owners: Array.from(r.owners.entries()),
        contestedBy: Array.from(r.contestedBy.values()),
      },
    ])
  );
}