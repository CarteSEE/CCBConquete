/* ------------------------------------------------- */
/* File: src/engine/capture.ts                       */
/* ------------------------------------------------- */
import { GameState } from "./types.js";

export function updateOwnership(state: GameState): void {
  for (const region of Object.values(state.regions)) {
    const living = Object.values(state.soldiers).filter(
      s => s.regionId === region.id && s.deadUntil <= state.tick
    );
    const camps = new Set(living.map(s => s.campId));

    if (camps.size === 1) {
      const campId = [...camps][0];
      if (!region.owners.has(campId)) {
        region.owners.set(campId, state.tick);
      }
      region.contestedBy.clear();
    } else if (camps.size > 1) {
      camps.forEach(c => region.contestedBy.add(c));
    }
  }
}