// A page-drawn stand-in for window.confirm(). Several in-app browsers people
// actually use this site through (KakaoTalk's in particular) block or
// silently no-op native confirm()/alert() dialogs, which made "나가기"
// buttons across the app look completely broken there — clicking them did
// nothing, since the code was waiting on a dialog that never appeared.
export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <p class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-cancel">취소</button>
          <button type="button" class="confirm-ok">확인</button>
        </div>
      </div>
    `;
    // textContent, not innerHTML, for the message — it can carry player-
    // supplied text (a nickname, a room name) by the time these calls have
    // more than one caller, so don't risk it being interpreted as markup.
    overlay.querySelector(".confirm-message")!.textContent = message;
    document.body.appendChild(overlay);

    const cleanup = (result: boolean): void => {
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector(".confirm-cancel")!.addEventListener("click", () => cleanup(false));
    overlay.querySelector(".confirm-ok")!.addEventListener("click", () => cleanup(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup(false);
    });
  });
}

// Same page-drawn overlay, single "확인" button — for telling the player
// something happened (e.g. another player's connection ending the game)
// rather than asking them to decide something.
export function showAlert(message: string): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog">
        <p class="confirm-message"></p>
        <div class="confirm-actions">
          <button type="button" class="confirm-ok">확인</button>
        </div>
      </div>
    `;
    overlay.querySelector(".confirm-message")!.textContent = message;
    document.body.appendChild(overlay);

    const cleanup = (): void => {
      overlay.remove();
      resolve();
    };
    overlay.querySelector(".confirm-ok")!.addEventListener("click", cleanup);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) cleanup();
    });
  });
}
