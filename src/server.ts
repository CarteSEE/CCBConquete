import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import { createEngine } from "./engine";

/* ------------------------------------------------------------------ */
/*  ES‑Modules : reconstruire __dirname                                */
/* ------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/* ------------------------------------------------------------------ */
/*  Serveur HTTP + Socket.IO                                          */
/* ------------------------------------------------------------------ */
const PORT = process.env.PORT ?? 3000;

const app  = express();
const httpServer = http.createServer(app);
const io   = new Server(httpServer, { pingInterval: 10_000 });

/*  Fichiers statiques                                                 */
app.use(express.static(path.join(__dirname, "..", "public")));

/*  Moteur de jeu                                                      */
const engine = createEngine(io);

/*  Premier handshake : envoyer l’état initial                         */
io.on("connection", (sock) => {
  const st = engine.getState();
  sock.emit("init", {
    tick: st.tick,
    camps: st.camps,
    regions: st.regions,
  });
});

/*  Lancement                                                          */
httpServer.listen(PORT, () =>
  console.log(`🚀  Server listening on http://localhost:${PORT}`)
);
