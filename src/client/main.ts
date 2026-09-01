import "./style.css";
import { startAdminMode } from "./adminMode";
import { getFriends } from "./friends";
import { startLocalMode } from "./localMode";
import { isAdminCodeSession, isAuthed, renderLoginGate } from "./loginGate";
import { renderMainMenu } from "./mainMenu";
import { startNetworkMode } from "./networkMode";
import { renderProfile } from "./profile";
import { renderRulebook } from "./rulebook";
import { getSpeed, setSpeed, type Speed } from "./speed";

const app = document.querySelector<HTMLDivElement>("#app")!;

// Both live outside renderLocalSetup so they survive that screen's own
// re-renders (speed toggle, +/- stepper, friend picks) — only reset when
// freshly entering the screen from the main menu (see renderModeSelect's
// onLocal below).
let localPlayerCount = 4;
let selectedFriendNames: string[] = [];

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
      localPlayerCount = 4;
      selectedFriendNames = [];
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
    onProfile: () => {
      document.body.classList.remove("pixel-menu-screen");
      renderProfile(app, renderModeSelect);
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
  const friends = getFriends();
  // At most (인원 수 - 1) AI seats exist to fill — if a player count
  // decrease drops below however many friends were already picked, trim
  // the picks down to match rather than leaving an inconsistent selection.
  const maxFriendPicks = localPlayerCount - 1;
  if (selectedFriendNames.length > maxFriendPicks) {
    selectedFriendNames = selectedFriendNames.slice(0, maxFriendPicks);
  }
  container.innerHTML = `
    <h1>Fuji Flush · 혼자하기</h1>
    <label>전체 인원 수 (나 + AI, 3~8명)</label>
    <div class="stepper" role="group" aria-label="전체 인원 수">
      <button type="button" id="player-count-minus" aria-label="인원 수 감소" ${localPlayerCount <= 3 ? "disabled" : ""}>−</button>
      <span class="stepper-value">${localPlayerCount}</span>
      <button type="button" id="player-count-plus" aria-label="인원 수 증가" ${localPlayerCount >= 8 ? "disabled" : ""}>+</button>
    </div>
    ${
      friends.length > 0
        ? `
      <label>함께할 친구 선택 (안 고르면 기존처럼 무작위 이름)</label>
      <div class="friend-picker" role="group" aria-label="함께할 친구 선택">
        ${friends
          .map((name) => {
            const active = selectedFriendNames.includes(name);
            const disabled = !active && selectedFriendNames.length >= maxFriendPicks;
            return `<button type="button" class="friend-chip${active ? " active" : ""}" data-friend-name="${name}" ${disabled ? "disabled" : ""}>${name}</button>`;
          })
          .join("")}
      </div>`
        : ""
    }
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
  container.querySelectorAll<HTMLButtonElement>(".friend-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.friendName!;
      selectedFriendNames = selectedFriendNames.includes(name)
        ? selectedFriendNames.filter((n) => n !== name)
        : [...selectedFriendNames, name];
      renderLocalSetup();
    });
  });
  container.querySelector("#player-count-minus")!.addEventListener("click", () => {
    localPlayerCount = Math.max(3, localPlayerCount - 1);
    renderLocalSetup();
  });
  container.querySelector("#player-count-plus")!.addEventListener("click", () => {
    localPlayerCount = Math.min(8, localPlayerCount + 1);
    renderLocalSetup();
  });
  container.querySelector("#start-btn")!.addEventListener("click", () => {
    // "뒤로가기" during the game re-opens this same setup screen; "✕" goes
    // all the way home to mode-select.
    startLocalMode(app, localPlayerCount, selectedFriendNames, renderLocalSetup, renderModeSelect);
  });
  container.querySelector("#back-btn")!.addEventListener("click", renderModeSelect);
}

window.addEventListener("hashchange", boot);
boot();
