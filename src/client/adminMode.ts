import { disableScreenWakeLock } from "./wakeLock";

interface AccessCodeRow {
  code: string;
  createdAt: number;
  isAdmin: boolean;
  nickname: string;
}

interface OnlineRoom {
  code: string;
  name: string;
  status: "LOBBY" | "IN_PROGRESS" | "FINISHED";
  hostName: string;
  players: string[];
}

const ROOM_STATUS_LABEL: Record<OnlineRoom["status"], string> = {
  LOBBY: "대기중",
  IN_PROGRESS: "게임중",
  FINISHED: "종료",
};

const ADMIN_SESSION_KEY = "fuji-flush-admin-password";

export function startAdminMode(app: HTMLElement, onExit: () => void): void {
  let password = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
  let authed = false;
  let codes: AccessCodeRow[] = [];
  let onlineRooms: OnlineRoom[] = [];
  let error = "";
  let codeFormError = "";
  let editingCode: string | null = null;
  let editNicknameError = "";

  async function tryLogin(candidate: string): Promise<void> {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: candidate }),
      });
      const data = await res.json();
      if (data.ok) {
        password = candidate;
        sessionStorage.setItem(ADMIN_SESSION_KEY, candidate);
        authed = true;
        error = "";
        await Promise.all([refreshCodes(), refreshOnline()]);
      } else {
        authed = false;
        error = data.message ?? "비밀번호가 올바르지 않습니다.";
      }
    } catch {
      authed = false;
      error = "서버에 연결할 수 없습니다.";
    }
    render();
  }

  async function refreshCodes(): Promise<void> {
    const res = await fetch("/api/admin/codes", {
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      const data = await res.json();
      codes = data.codes;
    }
  }

  // "현재 접속중" — see rooms.ts's listConnectedRooms doc comment for what
  // this can and can't see (only 같이하기 rooms). Manual refresh only (no
  // polling), matching every other admin action in this file.
  async function refreshOnline(): Promise<void> {
    const res = await fetch("/api/admin/online", {
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      const data = await res.json();
      onlineRooms = data.rooms;
    }
  }

  async function registerCode(code: string, isAdmin: boolean, nickname: string): Promise<void> {
    if (!code.trim()) return;
    if (!nickname.trim()) {
      codeFormError = "닉네임을 입력해주세요.";
      render();
      return;
    }
    try {
      const res = await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ code, isAdmin, nickname }),
      });
      const data = await res.json();
      if (res.ok) {
        codeFormError = "";
        codes = [data.code, ...codes];
      } else {
        codeFormError = data.message ?? "등록에 실패했습니다.";
      }
    } catch {
      codeFormError = "서버에 연결할 수 없습니다.";
    }
    render();
  }

  async function updateCodeNickname(code: string, nickname: string): Promise<void> {
    if (!nickname.trim()) {
      editNicknameError = "닉네임을 입력해주세요.";
      render();
      return;
    }
    try {
      const res = await fetch(`/api/admin/codes/${encodeURIComponent(code)}/nickname`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ nickname }),
      });
      const data = await res.json();
      if (res.ok) {
        codes = codes.map((c) => (c.code === code ? { ...c, nickname: data.code.nickname } : c));
        editingCode = null;
        editNicknameError = "";
      } else {
        editNicknameError = data.message ?? "변경에 실패했습니다.";
      }
    } catch {
      editNicknameError = "서버에 연결할 수 없습니다.";
    }
    render();
  }

  async function revoke(code: string): Promise<void> {
    codeFormError = "";
    const res = await fetch(`/api/admin/codes/${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: { "x-admin-password": password },
    });
    if (res.ok) {
      await refreshCodes();
      render();
    }
  }

  function render(): void {
    disableScreenWakeLock();
    if (!authed) {
      renderLoginForm();
    } else {
      renderPanel();
    }
  }

  function renderLoginForm(): void {
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "setup";
    container.innerHTML = `
      <h1>관리자 로그인</h1>
      ${error ? `<div class="message">${error}</div>` : ""}
      <label for="admin-pw">관리자 비밀번호</label>
      <input type="password" id="admin-pw" autocomplete="off" />
      <button id="admin-login-btn">로그인</button>
      <button id="admin-back-btn" class="back-btn-compact">← 뒤로</button>
    `;
    app.appendChild(container);

    const pwInput = container.querySelector<HTMLInputElement>("#admin-pw")!;
    const submit = () => tryLogin(pwInput.value);
    container.querySelector("#admin-login-btn")!.addEventListener("click", submit);
    pwInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    container.querySelector("#admin-back-btn")!.addEventListener("click", onExit);
  }

  function renderPanel(): void {
    app.innerHTML = "";
    const container = document.createElement("div");
    container.className = "admin-panel";
    const rows = codes
      .map((c) =>
        c.code === editingCode
          ? `
          <li>
            <span class="code-value">${c.code}</span>
            <input type="text" class="edit-nickname-input" data-code="${c.code}" value="${c.nickname}" maxlength="20" autocomplete="off" />
            <button class="edit-nickname-save-btn" data-code="${c.code}">저장</button>
            <button class="edit-nickname-cancel-btn">취소</button>
          </li>
        `
          : `
          <li>
            <span class="code-value">${c.code}</span>
            <span class="code-nickname">${c.nickname}</span>
            ${c.isAdmin ? `<span class="badge badge-turn">관리자</span>` : ""}
            <span class="code-date">${new Date(c.createdAt).toLocaleString("ko-KR")}</span>
            <button class="edit-nickname-btn" data-code="${c.code}">닉네임 수정</button>
            <button class="revoke-btn" data-code="${c.code}">삭제</button>
          </li>
        `,
      )
      .join("");

    const onlineRows = onlineRooms
      .map(
        (r) => `
          <li>
            <div class="online-room-head">
              <span class="code-value">${r.name}</span>
              <span class="badge badge-turn">${ROOM_STATUS_LABEL[r.status]}</span>
              <span class="code-date">코드 ${r.code}</span>
            </div>
            <div class="online-room-players">${r.players
              .map((name) => (name === r.hostName ? `${name} (방장)` : name))
              .join(", ")}</div>
          </li>
        `,
      )
      .join("");

    container.innerHTML = `
      <h1>입장 코드 관리</h1>
      <p>코드 하나가 계정 하나예요 — 코드, 닉네임을 함께 등록하세요. 그 코드로 로그인하면
      항상 같은 닉네임으로 참여해요. "관리자 코드"로 등록하면 그 코드로 로그인했을 때만
      관리자 모드 링크가 보여요.</p>
      <div class="code-form">
        <input type="text" id="new-code-input" placeholder="등록할 코드" autocomplete="off" />
        <input type="text" id="new-code-nickname" placeholder="닉네임" autocomplete="off" />
        <button id="new-code-btn">등록</button>
      </div>
      <label class="code-form-checkbox">
        <input type="checkbox" id="new-code-is-admin" /> 관리자 코드로 등록
      </label>
      ${codeFormError ? `<div class="message">${codeFormError}</div>` : ""}
      ${editNicknameError ? `<div class="message">${editNicknameError}</div>` : ""}
      <ul class="code-list">${rows || `<li class="code-empty">아직 등록한 코드가 없습니다.</li>`}</ul>

      <h1>현재 접속중 (같이하기)</h1>
      <p>온라인 방에 실제로 들어가 있는 사람만 보여요 — 혼자하기나 메뉴 화면에 있는 사람은
      서버가 알 수 없어요.</p>
      <button id="online-refresh-btn" type="button" class="edit-nickname-btn">새로고침</button>
      <ul class="code-list online-room-list">${onlineRows || `<li class="code-empty">현재 접속중인 온라인 방이 없습니다.</li>`}</ul>

      <button id="admin-exit-btn">나가기</button>
    `;
    app.appendChild(container);

    const codeInput = container.querySelector<HTMLInputElement>("#new-code-input")!;
    const nicknameInput = container.querySelector<HTMLInputElement>("#new-code-nickname")!;
    const isAdminCheckbox = container.querySelector<HTMLInputElement>("#new-code-is-admin")!;
    const submitCode = () => {
      const value = codeInput.value;
      const nickname = nicknameInput.value;
      const isAdmin = isAdminCheckbox.checked;
      codeInput.value = "";
      nicknameInput.value = "";
      isAdminCheckbox.checked = false;
      registerCode(value, isAdmin, nickname);
    };
    container.querySelector("#new-code-btn")!.addEventListener("click", submitCode);
    codeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitCode();
    });
    nicknameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submitCode();
    });
    container.querySelectorAll<HTMLButtonElement>(".revoke-btn").forEach((btn) => {
      btn.addEventListener("click", () => revoke(btn.dataset.code!));
    });
    container.querySelectorAll<HTMLButtonElement>(".edit-nickname-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingCode = btn.dataset.code!;
        editNicknameError = "";
        render();
      });
    });
    container.querySelectorAll<HTMLButtonElement>(".edit-nickname-cancel-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingCode = null;
        editNicknameError = "";
        render();
      });
    });
    container.querySelectorAll<HTMLInputElement>(".edit-nickname-input").forEach((input) => {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") updateCodeNickname(input.dataset.code!, input.value);
        if (e.key === "Escape") {
          editingCode = null;
          render();
        }
      });
    });
    container.querySelectorAll<HTMLButtonElement>(".edit-nickname-save-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const input = container.querySelector<HTMLInputElement>(
          `.edit-nickname-input[data-code="${btn.dataset.code}"]`,
        )!;
        updateCodeNickname(btn.dataset.code!, input.value);
      });
    });
    container.querySelector("#online-refresh-btn")!.addEventListener("click", async () => {
      await refreshOnline();
      render();
    });
    container.querySelector("#admin-exit-btn")!.addEventListener("click", onExit);
  }

  if (password) {
    tryLogin(password);
  } else {
    render();
  }
}
