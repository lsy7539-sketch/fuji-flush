interface Section {
  title: string;
  body: string;
  example?: string;
}

const SECTIONS: Section[] = [
  {
    title: "목표",
    body: "내 손패와 테이블 위에 낸 내 카드를 모두 없애면 승리예요. 여러 명이 동시에 승리할 수도 있어요.",
  },
  {
    title: "카드 구성 & 배분",
    body: "2~20 사이 숫자 카드 총 90장을 씁니다. 3~6명이면 각자 6장, 7~8명이면 각자 5장을 받고, 나머지는 드로우 더미로 남아요.",
  },
  {
    title: "카드 내기",
    body: "내 차례가 되면 손패에서 카드 1장을 골라 내 앞(테이블)에 냅니다. 어떤 숫자를 내도 상관없어요 — 테이블에 더 높은 숫자가 있어도 낮은 카드를 낼 수 있어요.",
  },
  {
    title: "Flush — 낮은 카드는 밀려나요",
    body: "새로 낸 카드(또는 연합)가 기존에 테이블에 있는 카드(또는 연합)보다 숫자가 높으면, 그 낮은 쪽은 밀려나서 버려지고 주인은 드로우 더미에서 카드 1장을 새로 받아요.",
    example:
      "지수 앞에 8이 있어요.\n" +
      "· 연수가 6을 낸다면? 6 < 8이니까 아무 일도 없어요. 둘 다 테이블에 남아요.\n" +
      "· 연수가 9를 낸다면? 9 > 8이니까 지수의 8이 밀려나 버려지고, 지수는 카드 1장을 뽑아요.",
  },
  {
    title: "연합(Joining Forces) — 같은 숫자는 힘을 합쳐요",
    body: "다른 사람이 이미 낸 카드와 똑같은 숫자를 내면 그 둘은 연합해요. 연합의 힘(POWER)은 [숫자 × 연합 인원]이고, 이 POWER로 다른 낮은 카드/연합을 밀어낼 수 있어요.",
    example:
      "나미가 7을 낸 상태에서 가희도 7을 냈어요 → 나미+가희 7 연합, POWER 14.\n" +
      "이 14보다 낮은 다른 카드나 연합은 전부 밀려나요.",
  },
  {
    title: "조심! 연합은 '실제로 낸 숫자'가 같아야 해요",
    body: "연합 조건은 오직 실제 카드 숫자가 같은지예요. 계산한 POWER 값이 우연히 같다고 해서 연합되는 게 아니에요.",
    example:
      "A와 B가 각각 5를 내서 5 연합(POWER 10)을 만들었어요.\n" +
      "그런데 C가 실제 숫자 10을 냈다면? C의 10은 이 5 연합에 합류하지 못해요 — 실제 숫자가 5가 아니라 10이니까요.\n" +
      "10(C의 카드)과 10(5 연합의 POWER)은 우연히 같을 뿐, 서로 다른 그룹이라 동점 처리돼요. 동점이면 아무도 밀려나지 않아요.",
  },
  {
    title: "내 차례가 다시 왔을 때 — 살아남으면 버려요",
    body: "다른 사람들 턴이 도는 동안 아무한테도 안 밀리고 살아남은 내 카드가 있다면, 내 차례가 시작될 때 그 카드를 버려요. 이번엔 드로우를 하지 않아요 — 이게 손패(+테이블 카드)를 실제로 줄이는 유일한 방법이에요.",
    example:
      "Flush당하면: 카드 버림 + 카드 1장 드로우 → 들고 있는 카드 수는 그대로예요.\n" +
      "내 차례까지 살아남으면: 카드 버림 + 드로우 없음 → 들고 있는 카드 수가 1장 줄어요. 승리에 가까워지는 건 이쪽이에요!",
  },
  {
    title: "연합도 함께 버려져요 — 자기 차례가 아니어도 승리 가능",
    body: "연합 중이던 카드가 소유자 중 한 명의 차례까지 살아남으면, 연합에 껴있던 다른 사람의 카드도 동시에 버려져요 (둘 다 드로우 없음). 그 순간 손패가 0장이 되는 사람은 자기 차례가 아니어도 바로 승리해요.",
    example:
      "나미와 가희가 7 연합 상태예요. 나미의 차례가 돌아와서 나미의 7이 살아남아 버려지면, 가희의 7도 같이 버려져요.\n" +
      "그 후 새 카드는 나미만 냅니다 — 가희는 자기 차례를 그냥 기다려요. 만약 이 순간 가희 손패가 0장이었다면, 가희는 자기 차례가 아닌데도 즉시 승리해요.",
  },
];

export function renderRulebook(app: HTMLElement, onBack: () => void): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup rulebook";
  container.innerHTML = `
    <h1>룰북</h1>
    <p class="rulebook-intro">Fuji Flush의 핵심 규칙을 예시와 함께 정리했어요.</p>
    ${SECTIONS.map(
      (s) => `
        <section class="rulebook-section">
          <h2>${s.title}</h2>
          <p>${s.body}</p>
          ${s.example ? `<div class="rulebook-example">${s.example.replace(/\n/g, "<br>")}</div>` : ""}
        </section>
      `,
    ).join("")}
    <button id="rulebook-back-btn">뒤로</button>
  `;
  app.appendChild(container);

  container.querySelector("#rulebook-back-btn")!.addEventListener("click", onBack);
}
