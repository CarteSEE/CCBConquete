import express from "express";
import http from "http";
import path from "path";
import { Server as IOServer } from "socket.io";
import { fileURLToPath } from "url";

import { createEngine } from "./engine/index.js";
import { TwitchAdapter } from "./adapters/twitch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;

const app = express();
const httpServer = http.createServer(app);
const io = new IOServer(httpServer, { pingInterval: 10_000 });

/* static */
app.use(express.static(path.join(__dirname, "..", "public")));

/* moteur de jeu */
const engine = createEngine(io);

/* commandes Twitch (optionnel) */
new TwitchAdapter(engine);

httpServer.listen(PORT, () => {
  console.log(`🚀  Server listening on http://localhost:${PORT}`);
});