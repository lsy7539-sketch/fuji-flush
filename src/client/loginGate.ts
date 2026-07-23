const SESSION_KEY = "fuji-flush-authed";

export function isAuthed(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export function renderLoginGate(app: HTMLElement, onSuccess: () => void): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup";
  container.innerHTML = `
    <h1>Fuji Flush</h1>
    <label for="entry-code">입장 코드</label>
    <input type="text" id="entry-code" placeholder="코드 입력" autocomplete="off" />
    <div id="login-error"></div>
    <button id="login-btn">입장하기</button>
    <a class="admin-link" href="#admin">관리자이신가요?</a>
  `;
  app.appendChild(container);

  const errorEl = container.querySelector<HTMLDivElement>("#login-error")!;
  const input = container.querySelector<HTMLInputElement>("#entry-code")!;

  async function submit(): Promise<void> {
    const code = input.value.trim();
    if (!code) return;
    errorEl.innerHTML = "";
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (data.ok) {
        sessionStorage.setItem(SESSION_KEY, "1");
        onSuccess();
      } else {
        errorEl.innerHTML = `<div class="message">${data.message ?? "코드가 올바르지 않습니다."}</div>`;
      }
    } catch {
      errorEl.innerHTML = `<div class="message">서버에 연결할 수 없습니다.</div>`;
    }
  }

  container.querySelector("#login-btn")!.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
}
