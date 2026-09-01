import "./style.css";
import { startAdminMode } from "./adminMode";
import { startLocalMode } from "./localMode";
import { isAdminCodeSession, isAuthed, renderLoginGate } from "./loginGate";
import { renderMainMenu } from "./mainMenu";
import { startNetworkMode } from "./networkMode";
import { renderRulebook } from "./rulebook";
import { getSpeed, setSpeed, type Speed } from "./speed";

const app = document.querySelector<HTMLDivElement>("#app")!;

function boot(): void {
  document.body.classList.remove("pixel-menu-screen");
  if (location.hash === "#admin") {
    startAdminMode(app, () => {
      location.hash = "";
      boot();
    });
    return;
  }
  if (!isAuthed()) {
    // Only this screen gets vertically centered — a short login card looks
    // stranded pinned to the top on a tall phone screen, but the same trick
    // would clip the top off a full game board or the rulebook.
    document.body.classList.add("center-screen");
    renderLoginGate(app, () => {
      document.body.classList.remove("center-screen");
      renderModeSelect();
    });
    return;
  }
  document.body.classList.remove("center-screen");
  renderModeSelect();
}

function renderModeSelect(): void {
  app.innerHTML = "";
  document.body.classList.remove("center-screen");
  document.body.classList.add("pixel-menu-screen");
  renderMainMenu(app, {
    onLocal: () => {
      document.body.classList.remove("pixel-menu-screen");
      renderLocalSetup();
    },
    onNetwork: () => {
      document.body.classList.remove("pixel-menu-screen");
      startNetworkMode(app, renderModeSelect);
    },
    onRulebook: () => {
      document.body.classList.remove("pixel-menu-screen");
      renderRulebook(app, renderModeSelect);
    },
    showAdminLink: isAdminCodeSession(),
  });
}

function renderLocalSetup(): void {
  app.innerHTML = "";
  document.body.classList.remove("pixel-menu-screen");
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
