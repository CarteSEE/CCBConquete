import { GameState } from "./types";

export function updateOwnership(state: GameState) {
  for (const region of Object.values(state.regions)) {
    const troops = Object.values(state.soldiers).filter(
      (s) => s.regionId === region.id && s.deadUntil <= state.tick
    );
    const camps = new Set(troops.map((t) => t.campId));

    if (camps.size === 1) {
      const cid = [...camps][0];
      const prev = [...region.owners.keys()][0];
      if (prev !== cid) {
        region.owners.clear();
        region.owners.set(cid, { campId: cid, turnEntered: state.tick });
        state.io.emit("regionUpdate", {
          id: region.id,
          camp: cid,
          turn: state.tick,
          color: state.camps[cid].color,
        });
      }
      region.contestedBy.clear();
    } else if (camps.size > 1) {
      region.contestedBy = camps;
    } else {
      region.contestedBy.clear();
    }
  }
}
