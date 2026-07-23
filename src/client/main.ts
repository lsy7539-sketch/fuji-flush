import "./style.css";
import { startAdminMode } from "./adminMode";
import { startLocalMode } from "./localMode";
import { isAdminCodeSession, isAuthed, renderLoginGate } from "./loginGate";
import { startNetworkMode } from "./networkMode";

const app = document.querySelector<HTMLDivElement>("#app")!;

function boot(): void {
  if (location.hash === "#admin") {
    startAdminMode(app, () => {
      location.hash = "";
      boot();
    });
    return;
  }
  if (!isAuthed()) {
    renderLoginGate(app, renderModeSelect);
    return;
  }
  renderModeSelect();
}

function renderModeSelect(): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup";
  container.innerHTML = `
    <h1>Fuji Flush</h1>
    <button id="mode-local">혼자하기 (AI 상대)</button>
    <button id="mode-network">온라인 멀티플레이</button>
    ${isAdminCodeSession() ? `<a class="admin-link" href="#admin">관리자 모드</a>` : ""}
  `;
  app.appendChild(container);

  container.querySelector("#mode-local")!.addEventListener("click", renderLocalSetup);
  container
    .querySelector("#mode-network")!
    .addEventListener("click", () => startNetworkMode(app, renderModeSelect));
}

function renderLocalSetup(): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup";
  container.innerHTML = `
    <h1>Fuji Flush · 혼자하기</h1>
    <label for="player-count">전체 인원 수 (나 + AI, 3~8명)</label>
    <input type="number" id="player-count" min="3" max="8" value="4" />
    <button id="start-btn">게임 시작</button>
    <button id="back-btn">뒤로</button>
  `;
  app.appendChild(container);

  container.querySelector("#start-btn")!.addEventListener("click", () => {
    const input = container.querySelector<HTMLInputElement>("#player-count")!;
    const count = Math.min(8, Math.max(3, Number(input.value) || 4));
    // "뒤로가기" during the game re-opens this same setup screen; "✕" goes
    // all the way home to mode-select.
    startLocalMode(app, count, renderLocalSetup, renderModeSelect);
  });
  container.querySelector("#back-btn")!.addEventListener("click", renderModeSelect);
}

window.addEventListener("hashchange", boot);
boot();
