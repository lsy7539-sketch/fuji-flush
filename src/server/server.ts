import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { handleConnection } from "./rooms";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dirname, "../../dist");

const app = express();
app.use(express.static(distDir));

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", handleConnection);

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
  console.log(`Fuji Flush server listening on port ${port}`);
});
