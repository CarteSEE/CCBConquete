import { readFileSync, writeFileSync } from "fs";
import { neighbors } from "topojson-client";

const topo = JSON.parse(readFileSync("public/nuts2.topojson", "utf-8"));
const geoms = topo.objects.collection.geometries;
const neigh = neighbors(geoms); // index → [adjIndexes]
const ids = geoms.map(g => g.properties.NUTS_ID);
const graph = Object.fromEntries(ids.map((id, i) => [id, neigh[i].map(j => ids[j])]));
writeFileSync("public/nuts2-adj.json", JSON.stringify(graph));
console.log("✅  nuts2-adj.json écrit (", Object.keys(graph).length, "régions )");