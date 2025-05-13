import { readFileSync, writeFileSync } from "fs";
import path from "path";
import topojson from "topojson-client";

const topoPath = path.resolve("public", "nuts2.topojson");
const topo = JSON.parse(readFileSync(topoPath, "utf-8"));
const geoms = topo.objects.collection.geometries;

const neigh = topojson.neighbors(geoms);          // index → [adjIndexes]
const ids = geoms.map(g => g.properties.NUTS_ID);
const graph = Object.fromEntries(
  ids.map((id, i) => [id, neigh[i].map(j => ids[j])])
);

writeFileSync(path.resolve("public", "nuts2-adj.json"), JSON.stringify(graph));
console.log("✅  nuts2-adj.json écrit (", Object.keys(graph).length, "régions )");