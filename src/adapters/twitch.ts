import tmi from "tmi.js";
import { Server as IOServer } from "socket.io";
import { GameState } from "../engine/types.js";

interface EngineLike {
  state: GameState;
  io: IOServer;
}

export class TwitchAdapter {
  constructor(readonly engine: EngineLike) {
    if (!process.env.TWITCH_CHANNEL) {
      console.log("🔇  Twitch désactivé — définis TWITCH_CHANNEL pour l’activer.");
      return;
    }

    const client = new tmi.Client({
      channels: [process.env.TWITCH_CHANNEL],
    });

    client.connect();

    client.on("message", (_channel, tags, message) => {
      if (message.startsWith("!move")) {
        const user = tags.username ?? "";
        console.log("[TWITCH]", user, message);
        /* TODO: mapper le viewer → soldier et placer un ordre */
      }
    });
  }
}