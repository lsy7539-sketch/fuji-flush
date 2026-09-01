// Fuji Flush main menu — "90s handheld / Game Boy" pixel screen.
// Pure SVG/CSS, no external images or fonts. Design frame: 390x780.

type MenuAction = "local" | "network" | "rulebook";

interface MainMenuOptions {
  onLocal: () => void;
  onNetwork: () => void;
  onRulebook: () => void;
  showAdminLink: boolean;
}

export function renderMainMenu(app: HTMLElement, opts: MainMenuOptions): void {
  app.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "ff-menu";
  wrap.innerHTML = `
    <div class="ff-menu-frame">
      <div class="ff-mountain">${mountainIconSvg()}</div>
      <h1 class="ff-logo">FUJI FLUSH</h1>
      <div class="ff-divider" aria-hidden="true"></div>
      <nav class="ff-menu-list" aria-label="메인 메뉴">
        ${menuItemHtml("local", "혼자하기", true)}
        ${menuItemHtml("network", "온라인", false)}
        ${menuItemHtml("rulebook", "룰북", false)}
      </nav>
      <div class="ff-grass" aria-hidden="true">${grassDecorationSvg()}</div>
      ${opts.showAdminLink ? `<a class="ff-admin-link" href="#admin">관리자 모드</a>` : ""}
    </div>
  `;
  app.appendChild(wrap);

  const items = Array.from(wrap.querySelectorAll<HTMLButtonElement>(".ff-menu-item"));
  const select = (target: HTMLButtonElement): void => {
    items.forEach((item) => item.classList.toggle("selected", item === target));
  };
  const actions: Record<MenuAction, () => void> = {
    local: opts.onLocal,
    network: opts.onNetwork,
    rulebook: opts.onRulebook,
  };

  items.forEach((item) => {
    item.addEventListener("mouseenter", () => select(item));
    item.addEventListener("focus", () => select(item));
    item.addEventListener("click", () => {
      actions[item.dataset.action as MenuAction]();
    });
  });
}

function menuItemHtml(action: MenuAction, label: string, selected: boolean): string {
  return `
    <button class="ff-menu-item${selected ? " selected" : ""}" type="button" data-action="${action}">
      <span class="ff-menu-arrow">${arrowIconSvg()}</span>
      <span class="ff-menu-label">${label}</span>
    </button>
  `;
}

function arrowIconSvg(): string {
  // blocky right-pointing pixel triangle, 7 rows growing then shrinking
  const rowWidths = [2, 3, 4, 5, 4, 3, 2];
  const bars = rowWidths
    .map((w, i) => `<rect x="0" y="${i + 1}" width="${w}" height="1" fill="currentColor" />`)
    .join("");
  return `<svg viewBox="0 0 8 8" width="18" height="18" style="shape-rendering:crispEdges" aria-hidden="true">${bars}</svg>`;
}

function mountainIconSvg(): string {
  // stepped pixel silhouette of Mt. Fuji, 3 colors + snow exception
  const outline =
    "44,6 48,6 48,12 54,12 54,18 60,18 60,24 66,24 66,30 74,30 74,54 18,54 18,30 26,30 26,24 32,24 32,18 38,18 38,12 44,12";
  return `
<svg class="ff-mountain-svg" viewBox="0 0 92 54" width="92" height="54" role="img" aria-label="후지산" style="shape-rendering:crispEdges">
  <polygon points="${outline}" fill="#315B45" stroke="#183A29" stroke-width="2" stroke-linejoin="miter" />
  <rect x="54" y="18" width="6" height="6" fill="#A8C95A" />
  <rect x="60" y="24" width="6" height="6" fill="#A8C95A" />
  <rect x="44" y="6" width="4" height="8" fill="#F7F8E8" />
  <rect x="40" y="12" width="12" height="4" fill="#F7F8E8" />
  <rect x="44" y="16" width="4" height="2" fill="#F7F8E8" />
</svg>`;
}

function grassDecorationSvg(): string {
  // 35 columns x 10px = 350px, deterministic irregular heights (no randomness
  // between reloads). Dark base strip + varied blades + a few dark pixel
  // accents + a handful of loose floating pixels above the blade line.
  const heights = [
    12, 18, 10, 22, 14, 20, 16, 24, 12, 18, 10, 16, 22, 14, 18, 12, 20, 16, 24, 10, 18, 14, 22, 12, 16, 20, 10, 18,
    14, 24, 16, 12, 20, 14, 18,
  ];
  const colWidth = 10;
  const barWidth = 8;

  const bars = heights
    .map((h, i) => {
      const fill = i % 5 === 0 ? "#315B45" : "#A8C95A";
      return `<rect x="${i * colWidth}" y="${48 - h}" width="${barWidth}" height="${h}" fill="${fill}" />`;
    })
    .join("");

  const notches = heights
    .map((h, i) => {
      if (i % 3 !== 1) return "";
      const x = i * colWidth + colWidth / 2 - 1.5;
      const y = 48 - h - 3;
      return `<rect x="${x}" y="${y}" width="3" height="3" fill="#183A29" />`;
    })
    .join("");

  // [x, y, size] — hand-placed, deliberately asymmetric
  const dots: Array<[number, number, number]> = [
    [23, 31, 3],
    [56, 20, 4],
    [92, 24, 3],
    [125, 17, 4],
    [164, 21, 3],
    [192, 30, 4],
    [235, 20, 3],
    [263, 19, 4],
    [304, 17, 3],
    [332, 20, 4],
  ];
  const floatingDots = dots.map(([x, y, s]) => `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#A8C95A" />`).join("");

  return `
<svg class="ff-grass-svg" viewBox="0 0 350 48" width="350" height="48" role="img" aria-hidden="true" style="shape-rendering:crispEdges">
  <rect x="0" y="40" width="350" height="8" fill="#315B45" />
  ${bars}
  ${notches}
  ${floatingDots}
</svg>`;
}
