/**
 * Pré‑calcule le graphe d’adjacence à partir de public/nuts2.topojson
 * et l’écrit dans public/nuts2‑adj.json
 */
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import * as topojson from "topojson-client";

// ---------------------------------------------------------------------------
// 1.  Charger le TopoJSON
// ---------------------------------------------------------------------------
const topoPath = path.resolve("public", "nuts2.topojson");
const topo = JSON.parse(readFileSync(topoPath, "utf-8"));

// 2.  Trouver automatiquement le 1er objet
const objectName = Object.keys(topo.objects)[0]; // ex. "nuts2", "layer0", etc.
const object = (topo.objects as any)[objectName];
if (!object?.geometries) {
  throw new Error(`Aucun objet TopoJSON avec des géométries dans ${topoPath}`);
}
const geoms = object.geometries;

// 3.  Tableau d’adjacence (vec<int[]>)
const neigh = topojson.neighbors(geoms);

// 4.  ID unique pour chaque région
const ids = geoms.map(
  (g: any, i: number) =>
    g.id || g.properties?.NUTS_ID || g.properties?.adm1_code || `id_${i}`
);

// 5.  Graphe (Record<id, id[]>)
const graph = Object.fromEntries(
  ids.map((id: string, i: number) => [id, neigh[i].map((j) => ids[j])])
);

// 6.  Écrire le fichier
const outPath = path.resolve("public", "nuts2-adj.json");
writeFileSync(outPath, JSON.stringify(graph));
console.log("✅  nuts2-adj.json écrit (", ids.length, "régions )");
