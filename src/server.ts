import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { createEngine } from "./engine";

const PORT = process.env.PORT ?? 3000;

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { pingInterval: 10_000 });

app.use(express.static(path.join(__dirname, "..", "public")));

const engine = createEngine(io);

io.on("connection", (sock) => {
  const state = engine.getState();
  sock.emit("init", {
    tick: state.tick,
    camps: state.camps,
    regions: state.regions,
  });
});

httpServer.listen(PORT, () =>
  console.log(`🚀  Server listening on http://localhost:${PORT}`)
);
