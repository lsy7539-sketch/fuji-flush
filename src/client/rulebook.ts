interface ExampleCard {
  value: number;
  owner: string;
  joined?: boolean;
  power?: number;
  flushed?: boolean;
}

function renderCard(c: ExampleCard): string {
  return `
    <div class="rule-card${c.joined ? " joined" : ""}${c.flushed ? " flushed" : ""}">
      <div class="rule-card-face">
        <span class="rule-card-value">${c.value}</span>
        ${c.joined && c.power ? `<span class="rule-card-power">${c.value}×?=${c.power}</span>` : ""}
        ${c.flushed ? `<span class="rule-card-flushed-tag">💥</span>` : ""}
      </div>
      <span class="rule-card-owner">${c.owner}</span>
    </div>
  `;
}

function renderRow(label: string, cards: ExampleCard[]): string {
  return `
    <div class="rule-row-group">
      <span class="rule-row-label">${label}</span>
      <div class="rule-row">${cards.map(renderCard).join("")}</div>
    </div>
  `;
}

interface Scene {
  before: ExampleCard[];
  action: string;
  after: ExampleCard[];
  note?: string;
}

function renderScene(scene: Scene): string {
  return `
    <div class="rule-scene">
      ${renderRow("현재 테이블", scene.before)}
      <div class="rule-arrow">↓ ${scene.action}</div>
      ${renderRow("결과", scene.after)}
      ${scene.note ? `<div class="rule-scene-note">${scene.note}</div>` : ""}
    </div>
  `;
}

interface Section {
  title: string;
  body: string;
  scene?: Scene;
  note?: string;
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
    body: "새로 낸 카드(또는 연합)가 기존에 테이블에 있는 카드(또는 연합)보다 숫자가 높으면, 그 낮은 쪽은 밀려나서 버려지고 주인은 드로우 더미에서 카드 1장을 새로 받아요. 반대로 새 카드가 더 낮으면? 둘 다 그냥 테이블에 남아요 — 아무 일도 없어요.",
    scene: {
      before: [{ value: 8, owner: "지수" }],
      action: "연수가 9를 냄 (9 > 8)",
      after: [
        { value: 8, owner: "지수", flushed: true },
        { value: 9, owner: "연수" },
      ],
      note: "지수의 8은 버려지고 드로우 더미에서 1장을 받아요. 만약 연수가 6을 냈다면(6 < 8) 아무 일도 없이 둘 다 남았을 거예요.",
    },
  },
  {
    title: "연합(Joining Forces) — 같은 숫자는 힘을 합쳐요",
    body: "다른 사람이 이미 낸 카드와 똑같은 숫자를 내면 그 둘은 연합해요. 연합의 힘(POWER)은 [숫자 × 연합 인원]이고, 이 POWER로 다른 낮은 카드/연합을 밀어낼 수 있어요.",
    scene: {
      before: [{ value: 7, owner: "나미" }],
      action: "가희도 7을 냄 (같은 숫자)",
      after: [
        { value: 7, owner: "나미", joined: true, power: 14 },
        { value: 7, owner: "가희", joined: true, power: 14 },
      ],
      note: "🤝 나미+가희 7 연합, POWER 14! 이 14보다 낮은 다른 카드나 연합은 전부 밀려나요.",
    },
  },
  {
    title: "조심! 연합은 '실제로 낸 숫자'가 같아야 해요",
    body: "연합 조건은 오직 실제 카드 숫자가 같은지예요. 계산한 POWER 값이 우연히 같다고 해서 연합되는 게 아니에요.",
    scene: {
      before: [
        { value: 5, owner: "A", joined: true, power: 10 },
        { value: 5, owner: "B", joined: true, power: 10 },
      ],
      action: "C가 실제 숫자 10을 냄",
      after: [
        { value: 5, owner: "A", joined: true, power: 10 },
        { value: 5, owner: "B", joined: true, power: 10 },
        { value: 10, owner: "C" },
      ],
      note: "C의 10은 5 연합에 합류하지 못해요 — 실제 숫자가 다르니까요. 10(C)과 10(5 연합의 POWER)은 동점 처리라 아무도 밀려나지 않아요.",
    },
  },
  {
    title: "내 차례가 다시 왔을 때 — 살아남으면 버려요",
    body: "다른 사람들 턴이 도는 동안 아무한테도 안 밀리고 살아남은 내 카드가 있다면, 내 차례가 시작될 때 그 카드를 버려요. 이번엔 드로우를 하지 않아요 — 이게 손패(+테이블 카드)를 실제로 줄이는 유일한 방법이에요.",
    scene: {
      before: [{ value: 7, owner: "나" }],
      action: "내 차례가 돌아옴 (아무한테도 안 밀리고 살아남음)",
      after: [{ value: 7, owner: "나", flushed: true }],
      note: "드로우 없이 그냥 버려져요. Flush(드로우 1장 받음)와 다르게, 이번엔 들고 있는 카드 수가 진짜로 1장 줄어요!",
    },
  },
  {
    title: "연합도 함께 버려져요 — 자기 차례가 아니어도 승리 가능",
    body: "연합 중이던 카드가 소유자 중 한 명의 차례까지 살아남으면, 연합에 껴있던 다른 사람의 카드도 동시에 버려져요 (둘 다 드로우 없음). 그 순간 손패가 0장이 되는 사람은 자기 차례가 아니어도 바로 승리해요.",
    scene: {
      before: [
        { value: 7, owner: "나미", joined: true, power: 14 },
        { value: 7, owner: "가희", joined: true, power: 14 },
      ],
      action: "나미의 차례가 돌아옴",
      after: [
        { value: 7, owner: "나미", flushed: true },
        { value: 7, owner: "가희", flushed: true },
      ],
      note: "둘 다 드로우 없이 버려져요. 그 다음 나미만 새 카드를 냅니다 — 가희는 자기 차례를 기다려요. 이 순간 가희 손패가 0장이었다면 가희는 즉시 승리!",
    },
  },
];

// The official walkthrough (RULES.md §31), reproduced as automated tests
// elsewhere in this repo — shown here turn by turn so the whole system
// clicks at once, the same way the original written rules first explained
// it to us.
interface Turn {
  label: string;
  action: string;
  table: ExampleCard[];
}

const TURNS: Turn[] = [
  { label: "TURN 1", action: "연수가 6을 냄", table: [{ value: 6, owner: "연수" }] },
  {
    label: "TURN 2",
    action: "지수가 8을 냄 (8 > 6, 연수의 6 Flush)",
    table: [{ value: 8, owner: "지수" }],
  },
  {
    label: "TURN 3",
    action: "나미가 7을 냄 (7 < 8, 아무 일도 없음)",
    table: [{ value: 8, owner: "지수" }, { value: 7, owner: "나미" }],
  },
  {
    label: "TURN 4",
    action: "가희가 7을 냄 → 나미+가희 7연합(POWER 14) → 14 > 8, 지수의 8 Flush",
    table: [
      { value: 7, owner: "나미", joined: true, power: 14 },
      { value: 7, owner: "가희", joined: true, power: 14 },
    ],
  },
  {
    label: "TURN 5",
    action: "연수가 9를 냄 (9 < 연합 POWER 14, 아무 일도 없음)",
    table: [
      { value: 7, owner: "나미", joined: true, power: 14 },
      { value: 7, owner: "가희", joined: true, power: 14 },
      { value: 9, owner: "연수" },
    ],
  },
  {
    label: "TURN 6",
    action: "지수가 14를 냄 → 7연합과는 동점(연합 유지) → 9보다는 높아서 연수의 9 Flush",
    table: [
      { value: 7, owner: "나미", joined: true, power: 14 },
      { value: 7, owner: "가희", joined: true, power: 14 },
      { value: 14, owner: "지수" },
    ],
  },
  {
    label: "TURN 7",
    action: "나미의 차례 → 나미+가희의 7 연합이 함께 버려짐 (드로우 없음) → 나미가 새 카드 6을 냄",
    table: [{ value: 14, owner: "지수" }, { value: 6, owner: "나미" }],
  },
];

export function renderRulebook(app: HTMLElement, onBack: () => void): void {
  app.innerHTML = "";
  const container = document.createElement("div");
  container.className = "setup rulebook";
  container.innerHTML = `
    <h1>룰북</h1>
    <p class="rulebook-intro">Fuji Flush의 핵심 규칙을 카드 예시와 함께 정리했어요.</p>
    ${SECTIONS.map(
      (s) => `
        <section class="rulebook-section">
          <h2>${s.title}</h2>
          <p>${s.body}</p>
          ${s.scene ? renderScene(s.scene) : ""}
        </section>
      `,
    ).join("")}
    <section class="rulebook-section">
      <h2>전체 흐름으로 한 번에 보기</h2>
      <p>위 규칙들이 실제로 어떻게 이어지는지, 한 판을 턴 순서대로 따라가 봐요.</p>
      <div class="rulebook-walkthrough">
        ${TURNS.map(
          (t) => `
            <div class="rule-turn">
              <div class="rule-turn-label">${t.label}</div>
              <div class="rule-turn-action">${t.action}</div>
              <div class="rule-row">${t.table.map(renderCard).join("")}</div>
            </div>
          `,
        ).join("")}
      </div>
    </section>
    <button id="rulebook-back-btn">뒤로</button>
  `;
  app.appendChild(container);

  container.querySelector("#rulebook-back-btn")!.addEventListener("click", onBack);
}
