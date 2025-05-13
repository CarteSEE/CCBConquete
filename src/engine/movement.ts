/* ------------------------------------------------- */
/* File: src/engine/movement.ts                      */
/* ------------------------------------------------- */
import { GameState } from "./types.js";
import { randomChoice } from "../utils/random.js";

const MOVE_PROBABILITY = 0.75;

export function applyRandomMove(state: GameState): void {
  for (const soldier of Object.values(state.soldiers)) {
    if (soldier.deadUntil > state.tick) continue;
    if (Math.random() > MOVE_PROBABILITY) continue;
    const neighbors = state.graph[soldier.regionId] ?? [];
    if (neighbors.length === 0) continue;
    soldier.regionId = randomChoice(neighbors);
  }
}