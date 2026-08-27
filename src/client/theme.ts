export type Theme = "casino" | "simple";

const STORAGE_KEY = "fuji-flush-theme";

export function getTheme(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "simple" ? "simple" : "casino";
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
}

export function initTheme(): void {
  document.documentElement.dataset.theme = getTheme();
}
