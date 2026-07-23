interface AccessCodeRow {
  code: string;
  createdAt: number;
}

const ADMIN_SESSION_KEY = "fuji-flush-admin-password";

export function startAdminMode(app: HTMLElement, onExit: () => void): void {
  let password = sessionStorage.getItem(ADMIN_SESSION_KEY) ?? "";
  let authed = false;
  let codes: AccessCodeRow[] = [];
  let error = "";

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
        await refreshCodes();
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

  async function createNewCode(): Promise<void> {
    const res = await fetch("/api/admin/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
    });
    if (res.ok) {
      await refreshCodes();
      render();
    }
  }

  async function revoke(code: string): Promise<void> {
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
      <button id="admin-back-btn">뒤로</button>
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
      .map(
        (c) => `
          <li>
            <span class="code-value">${c.code}</span>
            <span class="code-date">${new Date(c.createdAt).toLocaleString("ko-KR")}</span>
            <button class="revoke-btn" data-code="${c.code}">삭제</button>
          </li>
        `,
      )
      .join("");

    container.innerHTML = `
      <h1>입장 코드 관리</h1>
      <p>사용자는 이 중 하나의 코드로 로그인할 수 있어요.</p>
      <button id="new-code-btn">새 코드 만들기</button>
      <ul class="code-list">${rows || `<li class="code-empty">아직 만든 코드가 없습니다.</li>`}</ul>
      <button id="admin-exit-btn">나가기</button>
    `;
    app.appendChild(container);

    container.querySelector("#new-code-btn")!.addEventListener("click", createNewCode);
    container.querySelectorAll<HTMLButtonElement>(".revoke-btn").forEach((btn) => {
      btn.addEventListener("click", () => revoke(btn.dataset.code!));
    });
    container.querySelector("#admin-exit-btn")!.addEventListener("click", onExit);
  }

  if (password) {
    tryLogin(password);
  } else {
    render();
  }
}
