import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import { handleConnection, listConnectedRooms } from "./rooms";
import { initDb } from "./db";
import {
  checkAccessCode,
  listAccessCodes,
  registerAccessCode,
  revokeAccessCode,
  updateNickname,
  getFriendsForCode,
  addFriendForCode,
  removeFriendForCode,
  getAllianceTextForCode,
  updateAllianceTextForCode,
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
// index.html must never be cached — it's what points browsers at the
// current hashed JS/CSS bundle, so a stale cached copy of *it* is what
// makes a deploy look like it "didn't take" on a phone (mobile browsers,
// and in-app webviews especially, tend to hang onto a plain max-age=0
// response far more readily than desktop Chrome does). Every other file
// under dist/assets/ is content-hashed by Vite, so it's safe — actually
// correct — to cache those aggressively forever.
app.use(
  express.static(distDir, {
    setHeaders: (res, filePath) => {
      res.setHeader(
        "Cache-Control",
        filePath.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable",
      );
    },
  }),
);

app.post("/api/login", async (req, res) => {
  const code = req.body?.code;
  const result =
    typeof code === "string"
      ? await checkAccessCode(code)
      : { valid: false, isAdmin: false, nickname: "", allianceText: "" };
  if (result.valid) {
    res.json({ ok: true, isAdmin: result.isAdmin, nickname: result.nickname, allianceText: result.allianceText });
  } else {
    res.status(401).json({ ok: false, message: "코드가 올바르지 않습니다." });
  }
});

// Self-service rename (see profile.ts) — no admin auth, the caller's own
// access code (already proven at login) is what authorizes this.
app.post("/api/nickname", async (req, res) => {
  const code = req.body?.code;
  const nickname = req.body?.nickname;
  if (typeof code !== "string" || !code.trim() || typeof nickname !== "string") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  try {
    const updated = await updateNickname(code, nickname);
    res.json({ ok: true, nickname: updated.nickname });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "변경에 실패했습니다." });
  }
});

// Self-service 연합 phrase (see profile.ts / showAllianceBanner) — same
// trust model as /api/nickname above. GET-shaped as a POST (matches every
// other self-service route here) since the caller's own code has to go in
// the body, not a public URL param.
app.post("/api/alliance-text", async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  res.json({ ok: true, allianceText: await getAllianceTextForCode(code) });
});

app.post("/api/alliance-text/update", async (req, res) => {
  const code = req.body?.code;
  const text = req.body?.text;
  if (typeof code !== "string" || !code.trim() || typeof text !== "string") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  try {
    const allianceText = await updateAllianceTextForCode(code, text);
    res.json({ ok: true, allianceText });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "변경에 실패했습니다." });
  }
});

// Self-service friend list (see friends.ts) — same trust model as
// /api/nickname above: the caller's own access code authorizes the mutation.
app.post("/api/friends/list", async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  res.json({ ok: true, friends: await getFriendsForCode(code) });
});

app.post("/api/friends/add", async (req, res) => {
  const code = req.body?.code;
  const name = req.body?.name;
  if (typeof code !== "string" || !code.trim() || typeof name !== "string") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  const { result, friends } = await addFriendForCode(code, name);
  res.json({ ok: result === "ok", result, friends });
});

app.post("/api/friends/remove", async (req, res) => {
  const code = req.body?.code;
  const name = req.body?.name;
  if (typeof code !== "string" || !code.trim() || typeof name !== "string") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  res.json({ ok: true, friends: await removeFriendForCode(code, name) });
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

// "현재 접속중" — see rooms.ts's listConnectedRooms for exactly what this
// can and can't see (only 같이하기 rooms, not local-mode/menu browsing).
app.get("/api/admin/online", requireAdmin, (_req, res) => {
  res.json({ rooms: listConnectedRooms() });
});

app.post("/api/admin/codes", requireAdmin, async (req, res) => {
  const code = req.body?.code;
  const isAdmin = req.body?.isAdmin === true;
  const nickname = req.body?.nickname;
  if (typeof code !== "string" || !code.trim()) {
    res.status(400).json({ ok: false, message: "코드를 입력해주세요." });
    return;
  }
  try {
    res.json({ code: await registerAccessCode(code, isAdmin, typeof nickname === "string" ? nickname : "") });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "등록에 실패했습니다." });
  }
});

app.delete("/api/admin/codes/:code", requireAdmin, async (req, res) => {
  res.json({ ok: await revokeAccessCode(String(req.params.code)) });
});

// Lets an admin rename any existing code's account — unlike /api/nickname
// (self-service, authorized by knowing the code itself), this is for fixing
// up someone else's account and so goes through the same requireAdmin gate
// as the rest of /api/admin/*.
app.patch("/api/admin/codes/:code/nickname", requireAdmin, async (req, res) => {
  const nickname = req.body?.nickname;
  if (typeof nickname !== "string") {
    res.status(400).json({ ok: false, message: "잘못된 요청입니다." });
    return;
  }
  try {
    const updated = await updateNickname(String(req.params.code), nickname);
    res.json({ ok: true, code: updated });
  } catch (err) {
    res.status(400).json({ ok: false, message: err instanceof Error ? err.message : "변경에 실패했습니다." });
  }
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
