import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { handleConnection } from "./rooms";
import { initDb } from "./db";
import {
  checkAccessCode,
  listAccessCodes,
  registerAccessCode,
  revokeAccessCode,
} from "./accessCodes";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(dirname, "../../dist");

// Change this via the ADMIN_PASSWORD environment variable before deploying —
// the default here is only for local development.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme-admin";

// Locks out an IP for a while after too many wrong admin-password attempts.
// The admin password is user-chosen (unlike the random access codes) and is
// the highest-value target, so it's the one thing worth guarding this way.
const MAX_ADMIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_MS = 5 * 60 * 1000;
const adminAttempts = new Map<string, { count: number; lockedUntil: number }>();

function isAdminLocked(key: string): boolean {
  const entry = adminAttempts.get(key);
  return entry !== undefined && Date.now() < entry.lockedUntil;
}

function recordAdminFailure(key: string): void {
  const entry = adminAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_ADMIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + ADMIN_LOCKOUT_MS;
    entry.count = 0;
  }
  adminAttempts.set(key, entry);
}

function recordAdminSuccess(key: string): void {
  adminAttempts.delete(key);
}

const app = express();
// Render (and most hosts) sit behind a reverse proxy — without this, every
// request looks like it comes from the proxy's own IP, which would make the
// admin-login rate limit share one bucket across all real visitors.
app.set("trust proxy", true);
app.use(express.json());
app.use(express.static(distDir));

app.post("/api/login", async (req, res) => {
  const code = req.body?.code;
  const result = typeof code === "string" ? await checkAccessCode(code) : { valid: false, isAdmin: false };
  if (result.valid) {
    res.json({ ok: true, isAdmin: result.isAdmin });
  } else {
    res.status(401).json({ ok: false, message: "코드가 올바르지 않습니다." });
  }
});

app.post("/api/admin/login", (req, res) => {
  if (isAdminLocked(req.ip!)) {
    res.status(429).json({ ok: false, message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요." });
    return;
  }
  if (req.body?.password === ADMIN_PASSWORD) {
    recordAdminSuccess(req.ip!);
    res.json({ ok: true });
  } else {
    recordAdminFailure(req.ip!);
    res.status(401).json({ ok: false, message: "비밀번호가 올바르지 않습니다." });
  }
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (isAdminLocked(req.ip!)) {
    res.status(429).json({ ok: false, message: "시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요." });
    return;
  }
  if (req.header("x-admin-password") === ADMIN_PASSWORD) {
    recordAdminSuccess(req.ip!);
    next();
    return;
  }
  recordAdminFailure(req.ip!);
  res.status(401).json({ ok: false, message: "관리자 인증이 필요합니다." });
}

app.get("/api/admin/codes", requireAdmin, async (_req, res) => {
  res.json({ codes: await listAccessCodes() });
});

app.post("/api/admin/codes", requireAdmin, async (req, res) => {
  const code = req.body?.code;
  const isAdmin = req.body?.isAdmin === true;
  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ ok: false, message: "코드를 입력해주세요." });
    return;
  }
  try {
    res.json({ code: await registerAccessCode(code, isAdmin) });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "등록에 실패했습니다." });
  }
});

app.delete("/api/admin/codes/:code", requireAdmin, async (req, res) => {
  res.json({ ok: await revokeAccessCode(String(req.params.code)) });
});

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
wss.on("connection", handleConnection);

const port = Number(process.env.PORT) || 3000;

initDb()
  .then(() => {
    httpServer.listen(port, () => {
      console.log(`Fuji Flush server listening on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("DB 초기화에 실패했습니다:", err);
    process.exit(1);
  });
