import { defaultTheme, findTheme, type Theme } from "./themes";

/**
 * Browser-side theme state, shared by the top bar picker and the shell.
 * The <head> inline script applies the stored theme before first paint;
 * this module keeps everything in sync afterwards via one DOM event.
 */
export const THEME_KEY = "wsh:theme";
export const CRT_KEY = "wsh:crt";
export const THEME_EVENT = "wsh:theme-change";
/** Ask the home page terminal to run a command (detail: the command). */
export const RUN_EVENT = "wsh:run";

export function currentTheme(): Theme {
  return findTheme(document.documentElement.dataset.theme) ?? defaultTheme;
}

export function setDocumentTheme(theme: Theme): void {
  const root = document.documentElement;
  if (root.dataset.theme === theme.id) {
    return;
  }
  root.dataset.theme = theme.id;
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    // Private mode: the theme just won't persist.
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme.id }));
}

/** Scanlines: explicit on/off wins, otherwise the theme decides. */
export function crtEnabled(): boolean {
  const value = document.documentElement.dataset.crt;
  return value === "on" || (value !== "off" && Boolean(currentTheme().crt));
}

export function setCrt(on: boolean): void {
  document.documentElement.dataset.crt = on ? "on" : "off";
  try {
    localStorage.setItem(CRT_KEY, on ? "on" : "off");
  } catch {
    // Not persisted.
  }
}
