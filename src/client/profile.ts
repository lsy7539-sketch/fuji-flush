import { addFriend, getFriends, removeFriend } from "./friends";
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
    <label for="friend-name-input">같이 하고 싶은 친구들 (혼자하기 상대 이름으로 골라 쓸 수 있어요)</label>
    <div class="friend-add-row">
      <input type="text" id="friend-name-input" placeholder="친구 닉네임" maxlength="20" autocomplete="off" />
      <button id="friend-add-btn" type="button">추가</button>
    </div>
    <ul class="friend-list">${renderFriendList(getFriends())}</ul>
    <button id="back-btn">뒤로</button>
  `;
  app.appendChild(container);

  const input = container.querySelector<HTMLInputElement>("#nickname-input")!;
  const messageEl = container.querySelector<HTMLDivElement>("#profile-message")!;
  const friendInput = container.querySelector<HTMLInputElement>("#friend-name-input")!;
  const friendListEl = container.querySelector<HTMLUListElement>(".friend-list")!;

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

  function refreshFriendList(): void {
    friendListEl.innerHTML = renderFriendList(getFriends());
    friendListEl.querySelectorAll<HTMLButtonElement>(".friend-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        removeFriend(btn.dataset.name!);
        refreshFriendList();
      });
    });
  }

  function addFriendFromInput(): void {
    if (!friendInput.value.trim()) return;
    addFriend(friendInput.value);
    friendInput.value = "";
    refreshFriendList();
  }

  container.querySelector("#save-btn")!.addEventListener("click", save);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") save();
  });
  container.querySelector("#friend-add-btn")!.addEventListener("click", addFriendFromInput);
  friendInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addFriendFromInput();
  });
  refreshFriendList();
  container.querySelector("#back-btn")!.addEventListener("click", onBack);
}

function renderFriendList(friends: string[]): string {
  if (friends.length === 0) {
    return `<li class="friend-empty">아직 추가한 친구가 없어요.</li>`;
  }
  return friends
    .map(
      (name) => `
        <li>
          <span>${name}</span>
          <button class="friend-remove-btn" type="button" data-name="${name}">삭제</button>
        </li>
      `,
    )
    .join("");
}
