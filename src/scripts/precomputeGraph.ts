import { readFileSync, writeFileSync } from "fs";
import path from "path";
import topojson from "topojson-client";

const topoPath = path.resolve("public", "nuts2.topojson");
const topo = JSON.parse(readFileSync(topoPath, "utf-8"));
// ---- récupérer dynamiquement le 1er objet topo ----
const objectName = Object.keys(topo.objects)[0];           // ex. "nuts2" ou "layer0"
const geoms = (topo.objects as any)[objectName].geometries;
if (!geoms) {
  throw new Error(`Aucun objet TopoJSON trouvé dans ${objectName}`);
}


const neigh = topojson.neighbors(geoms);          // index -> [adjIndexes]
const ids = geoms.map(g => g.properties.NUTS_ID);
const graph = Object.fromEntries(
  ids.map((id, i) => [id, neigh[i].map(j => ids[j])])
);

writeFileSync(path.resolve("public", "nuts2-adj.json"), JSON.stringify(graph));
console.log("✅  nuts2-adj.json écrit (", Object.keys(graph).length, "régions )");
