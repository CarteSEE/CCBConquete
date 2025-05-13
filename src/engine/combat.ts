/* ------------------------------------------------- */
/* File: src/engine/combat.ts                        */
/* ------------------------------------------------- */
import { GameState, Soldier } from "./types.js";
import { randomChoice } from "../utils/random.js";

const DMG = 1;
const DEATH_TIMER = 3; // tours avant respawn

export function resolveCombat(state: GameState): void {
  const byRegion: Record<string, Soldier[]> = {};

  for (const s of Object.values(state.soldiers)) {
    if (s.deadUntil > state.tick) continue;
    (byRegion[s.regionId] ??= []).push(s);
  }

  for (const troops of Object.values(byRegion)) {
    const camps = new Set(troops.map(t => t.campId));
    if (camps.size <= 1) continue; // pas de combat

    troops.forEach(attacker => {
      const targets = troops.filter(t => t.campId !== attacker.campId && t.deadUntil <= state.tick);
      if (targets.length === 0) return;
      const victim = randomChoice(targets);
      victim.hp -= DMG;
      if (victim.hp <= 0) {
        victim.deadUntil = state.tick + DEATH_TIMER;
        victim.hp = 3; // réinitialisation pour le respawn
      }
    });
  }
}