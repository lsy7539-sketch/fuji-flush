import { getAccessCode, getNickname, setNickname } from "./loginGate";

export function renderProfile(app: HTMLElement, onBack: () => void): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup";
  container.innerHTML = `
    <h1>내 정보</h1>
    <label for="nickname-input">내 닉네임은</label>
    <input type="text" id="nickname-input" value="${getNickname()}" maxlength="20" autocomplete="off" />
    <div id="profile-message"></div>
    <button id="save-btn">저장</button>
    <button id="back-btn">뒤로</button>
  `;
  app.appendChild(container);

  const input = container.querySelector<HTMLInputElement>("#nickname-input")!;
  const messageEl = container.querySelector<HTMLDivElement>("#profile-message")!;

  async function save(): Promise<void> {
    const nickname = input.value.trim();
    if (!nickname) return;
    messageEl.innerHTML = "";
    try {
      const res = await fetch("/api/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: getAccessCode(), nickname }),
      });
      const data = await res.json();
      if (data.ok) {
        setNickname(data.nickname);
        messageEl.innerHTML = `<div class="message win">닉네임이 변경되었습니다.</div>`;
      } else {
        messageEl.innerHTML = `<div class="message">${data.message ?? "변경에 실패했습니다."}</div>`;
      }
    } catch {
      messageEl.innerHTML = `<div class="message">서버에 연결할 수 없습니다.</div>`;
    }
  }

  container.querySelector("#save-btn")!.addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  container.querySelector("#back-btn")!.addEventListener("click", onBack);
}
