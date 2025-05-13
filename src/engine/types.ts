/* ------------------------------------------------- */
/* File: src/engine/types.ts                         */
/* ------------------------------------------------- */
export interface Camp {
  id: string;
  name: string;
  color: string;
  capitalId: string;
  alive: boolean;
}

export interface Region {
  id: string;
  owners: Map<string, number>; // campId → tour de capture
  contestedBy: Set<string>;
}

export interface Soldier {
  id: string;
  username: string;
  campId: string;
  regionId: string;
  hp: number;
  deadUntil: number;
}

export interface GameState {
  tick: number;
  camps: Record<string, Camp>;
  regions: Record<string, Region>;
  soldiers: Record<string, Soldier>;
  graph: Record<string, readonly string[]>;
}