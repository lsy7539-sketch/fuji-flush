import "./style.css";
import { startAdminMode } from "./adminMode";
import { startLocalMode } from "./localMode";
import { isAdminCodeSession, isAuthed, renderLoginGate } from "./loginGate";
import { startNetworkMode } from "./networkMode";
import { renderRulebook } from "./rulebook";
import { getSpeed, setSpeed, type Speed } from "./speed";
import { getTheme, initTheme, setTheme, type Theme } from "./theme";

const app = document.querySelector<HTMLDivElement>("#app")!;

initTheme();

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
  const theme = getTheme();
  container.innerHTML = `
    <h1>Fuji Flush</h1>
    <div class="toggle-group" role="group" aria-label="테마 선택">
      <button class="toggle-btn${theme === "casino" ? " active" : ""}" data-theme-option="casino">카지노</button>
      <button class="toggle-btn${theme === "simple" ? " active" : ""}" data-theme-option="simple">심플</button>
    </div>
    <button id="mode-local">혼자하기 (AI 상대)</button>
    <button id="mode-network">온라인 멀티플레이</button>
    <button id="mode-rulebook">룰북</button>
    ${isAdminCodeSession() ? `<a class="admin-link" href="#admin">관리자 모드</a>` : ""}
  `;
  app.appendChild(container);

  container.querySelectorAll<HTMLButtonElement>(".toggle-btn[data-theme-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setTheme(btn.dataset.themeOption as Theme);
      renderModeSelect();
    });
  });
  container.querySelector("#mode-local")!.addEventListener("click", renderLocalSetup);
  container
    .querySelector("#mode-network")!
    .addEventListener("click", () => startNetworkMode(app, renderModeSelect));
  container
    .querySelector("#mode-rulebook")!
    .addEventListener("click", () => renderRulebook(app, renderModeSelect));
}

function renderLocalSetup(): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup";
  const speed = getSpeed();
  const speedLabels: Record<Speed, string> = { slow: "느리게", normal: "보통", fast: "빠르게" };
  container.innerHTML = `
    <h1>Fuji Flush · 혼자하기</h1>
    <label for="player-count">전체 인원 수 (나 + AI, 3~8명)</label>
    <input type="number" id="player-count" min="3" max="8" value="4" />
    <label>게임 진행 속도</label>
    <div class="toggle-group" role="group" aria-label="게임 진행 속도">
      ${(["slow", "normal", "fast"] as Speed[])
        .map(
          (s) =>
            `<button class="toggle-btn${s === speed ? " active" : ""}" data-speed-option="${s}">${speedLabels[s]}</button>`,
        )
        .join("")}
    </div>
    <button id="start-btn">게임 시작</button>
    <button id="back-btn">뒤로</button>
  `;
  app.appendChild(container);

  container.querySelectorAll<HTMLButtonElement>(".toggle-btn[data-speed-option]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSpeed(btn.dataset.speedOption as Speed);
      renderLocalSetup();
    });
  });
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
