import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { handleConnection } from "./rooms";
import {
  createAccessCode,
  isValidAccessCode,
  listAccessCodes,
  revokeAccessCode,
} from "./accessCodes";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dirname, "../../dist");

// Change this via the ADMIN_PASSWORD environment variable before deploying —
// the default here is only for local development.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme-admin";

const app = express();
app.use(express.json());
app.use(express.static(distDir));

app.post("/api/login", (req, res) => {
  const code = req.body?.code;
  if (typeof code === "string" && isValidAccessCode(code)) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, message: "코드가 올바르지 않습니다." });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (req.body?.password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, message: "비밀번호가 올바르지 않습니다." });
  }
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.header("x-admin-password") === ADMIN_PASSWORD) {
    next();
    return;
  }
  res.status(401).json({ ok: false, message: "관리자 인증이 필요합니다." });
}

app.get("/api/admin/codes", requireAdmin, (_req, res) => {
  res.json({ codes: listAccessCodes() });
});

app.post("/api/admin/codes", requireAdmin, (_req, res) => {
  res.json({ code: createAccessCode() });
});

app.delete("/api/admin/codes/:code", requireAdmin, (req, res) => {
  res.json({ ok: revokeAccessCode(String(req.params.code)) });
});

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", handleConnection);

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
  console.log(`Fuji Flush server listening on port ${port}`);
});
