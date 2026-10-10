/**
 * Color themes — the single source of truth for both the CSS custom
 * properties (generated into the page head) and the xterm.js palette.
 * Switching a theme recolors the chrome instantly and the shell re-renders
 * its transcript, so every surface always agrees.
 */
export interface Theme {
  id: string;
  label: string;
  /** Light themes flip `color-scheme` so native controls follow. */
  light?: boolean;
  /** Optional CRT scanlines by default (the amber phosphor look). */
  crt?: boolean;
  /** Desktop wallpaper behind the panels. */
  bg: string;
  /** Panel (window) background — also the terminal background. */
  panel: string;
  /** Raised surfaces inside panels: chips, inputs, hovered rows. */
  raised: string;
  border: string;
  borderStrong: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  /** Text drawn on top of the accent color. */
  onAccent: string;
  /** Secondary accent — banner gradients, hostnames, highlights. */
  accent2: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
}

export const themes: Theme[] = [
  {
    id: "webterm",
    label: "webterm",
    bg: "#06060b",
    panel: "#0b0b12",
    raised: "#13131e",
    border: "#1f1f30",
    borderStrong: "#33334d",
    text: "#e6e6f0",
    muted: "#a3a3b8",
    faint: "#63637c",
    accent: "#50fa7b",
    onAccent: "#06060b",
    accent2: "#8be9fd",
    red: "#ff6b6b",
    green: "#50fa7b",
    yellow: "#ffb86c",
    blue: "#6cb6ff",
    magenta: "#c792ea",
    cyan: "#8be9fd",
  },
  {
    id: "rose-pine",
    label: "rosé pine",
    bg: "#12101b",
    panel: "#191724",
    raised: "#1f1d2e",
    border: "#26233a",
    borderStrong: "#403d52",
    text: "#e0def4",
    muted: "#908caa",
    faint: "#6e6a86",
    accent: "#ebbcba",
    onAccent: "#191724",
    accent2: "#c4a7e7",
    red: "#eb6f92",
    green: "#9ccfd8",
    yellow: "#f6c177",
    blue: "#3e8fb0",
    magenta: "#c4a7e7",
    cyan: "#9ccfd8",
  },
  {
    id: "dracula",
    label: "dracula",
    bg: "#1b1c25",
    panel: "#22232e",
    raised: "#2c2e3b",
    border: "#343746",
    borderStrong: "#4b4f66",
    text: "#f8f8f2",
    muted: "#b6b8cc",
    faint: "#6d7aac",
    accent: "#bd93f9",
    onAccent: "#1b1c25",
    accent2: "#ff79c6",
    red: "#ff5555",
    green: "#50fa7b",
    yellow: "#f1fa8c",
    blue: "#8be9fd",
    magenta: "#ff79c6",
    cyan: "#8be9fd",
  },
  {
    id: "catppuccin",
    label: "catppuccin",
    bg: "#11111b",
    panel: "#1e1e2e",
    raised: "#262637",
    border: "#313244",
    borderStrong: "#45475a",
    text: "#cdd6f4",
    muted: "#a6adc8",
    faint: "#6c7086",
    accent: "#cba6f7",
    onAccent: "#11111b",
    accent2: "#89b4fa",
    red: "#f38ba8",
    green: "#a6e3a1",
    yellow: "#f9e2af",
    blue: "#89b4fa",
    magenta: "#f5c2e7",
    cyan: "#94e2d5",
  },
  {
    id: "tokyo-night",
    label: "tokyo night",
    bg: "#101119",
    panel: "#16161e",
    raised: "#1f2030",
    border: "#292e42",
    borderStrong: "#3b4261",
    text: "#c0caf5",
    muted: "#a9b1d6",
    faint: "#5f6896",
    accent: "#7aa2f7",
    onAccent: "#101119",
    accent2: "#bb9af7",
    red: "#f7768e",
    green: "#9ece6a",
    yellow: "#e0af68",
    blue: "#7aa2f7",
    magenta: "#bb9af7",
    cyan: "#7dcfff",
  },
  {
    id: "gruvbox",
    label: "gruvbox",
    bg: "#141617",
    panel: "#1d2021",
    raised: "#282828",
    border: "#32302f",
    borderStrong: "#504945",
    text: "#ebdbb2",
    muted: "#bdae93",
    faint: "#7c6f64",
    accent: "#fabd2f",
    onAccent: "#1d2021",
    accent2: "#fe8019",
    red: "#fb4934",
    green: "#b8bb26",
    yellow: "#fabd2f",
    blue: "#83a598",
    magenta: "#d3869b",
    cyan: "#8ec07c",
  },
  {
    id: "amber",
    label: "amber crt",
    crt: true,
    bg: "#080500",
    panel: "#0e0900",
    raised: "#1a1100",
    border: "#2e1f00",
    borderStrong: "#4d3400",
    text: "#ffb000",
    muted: "#d18f00",
    faint: "#8a5e00",
    accent: "#ffcc4d",
    onAccent: "#0e0900",
    accent2: "#ff9500",
    red: "#ff6a00",
    green: "#ffc233",
    yellow: "#ffd480",
    blue: "#e6a200",
    magenta: "#ffb84d",
    cyan: "#ffd27a",
  },
  {
    id: "paper",
    label: "paper",
    light: true,
    bg: "#e4e0d5",
    panel: "#f7f5ef",
    raised: "#ece8dd",
    border: "#d3cdbd",
    borderStrong: "#b3ab96",
    text: "#24242c",
    muted: "#4f4f5a",
    faint: "#8a8474",
    accent: "#16803c",
    onAccent: "#ffffff",
    accent2: "#0b5cad",
    red: "#c4281c",
    green: "#16803c",
    yellow: "#9a5b00",
    blue: "#0b5cad",
    magenta: "#7c3aed",
    cyan: "#0e7490",
  },
];

export const defaultTheme = themes[0]!;

export function findTheme(id: string | null | undefined): Theme | undefined {
  if (!id) {
    return undefined;
  }
  const wanted = id.toLowerCase().replace(/[\s_]+/g, "-");
  return themes.find(
    (theme) => theme.id === wanted || theme.label.replace(/\s+/g, "-") === wanted,
  );
}

const cssVariables: [string, keyof Theme][] = [
  ["--bg", "bg"],
  ["--panel", "panel"],
  ["--raised", "raised"],
  ["--border", "border"],
  ["--border-strong", "borderStrong"],
  ["--text", "text"],
  ["--muted", "muted"],
  ["--faint", "faint"],
  ["--accent", "accent"],
  ["--on-accent", "onAccent"],
  ["--accent-2", "accent2"],
  ["--red", "red"],
  ["--green", "green"],
  ["--yellow", "yellow"],
  ["--blue", "blue"],
  ["--magenta", "magenta"],
  ["--cyan", "cyan"],
];

/** CSS for every theme, keyed by `data-theme` on <html>; default on :root. */
export function themeStylesheet(): string {
  return themes
    .map((theme) => {
      const selector =
        theme === defaultTheme
          ? `:root, [data-theme="${theme.id}"]`
          : `[data-theme="${theme.id}"]`;
      const declarations = cssVariables
        .map(([name, key]) => `${name}:${String(theme[key])};`)
        .join("");
      return `${selector}{${declarations}color-scheme:${theme.light ? "light" : "dark"};}`;
    })
    .join("\n");
}

/** Hex → [r, g, b]. Accepts #rgb and #rrggbb. */
export function hexToRgb(hex: string): [number, number, number] {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = [...value].map((character) => character + character).join("");
  }
  const number = Number.parseInt(value, 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

/** Linear blend between two hex colors, t in [0, 1]. */
export function mix(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const channel = (index: 0 | 1 | 2) =>
    Math.round(a[index] + (b[index] - a[index]) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

/** The xterm.js ITheme for a theme (kept structural to avoid importing xterm). */
export function xtermTheme(theme: Theme) {
  return {
    background: theme.panel,
    foreground: theme.text,
    cursor: theme.accent,
    cursorAccent: theme.panel,
    selectionBackground: mix(theme.panel, theme.accent, 0.28),
    selectionInactiveBackground: mix(theme.panel, theme.faint, 0.3),
    scrollbarSliderBackground: mix(theme.panel, theme.faint, 0.35),
    scrollbarSliderHoverBackground: mix(theme.panel, theme.faint, 0.55),
    scrollbarSliderActiveBackground: mix(theme.panel, theme.accent, 0.5),
    black: theme.raised,
    red: theme.red,
    green: theme.green,
    yellow: theme.yellow,
    blue: theme.blue,
    magenta: theme.magenta,
    cyan: theme.cyan,
    white: theme.muted,
    brightBlack: theme.faint,
    brightRed: theme.red,
    brightGreen: theme.green,
    brightYellow: theme.yellow,
    brightBlue: theme.blue,
    brightMagenta: theme.magenta,
    brightCyan: theme.cyan,
    brightWhite: theme.text,
  };
}
