import { hexToRgb, mix, type Theme } from "../themes";

/**
 * Small ANSI toolkit. Output is truecolor and built from the active theme;
 * the shell re-renders its transcript when the theme or width changes, so
 * colors and layout never go stale.
 */

const CSI = "\x1b[";
const OSC = "\x1b]";
const BEL = "\x07";

export const reset = `${CSI}0m`;

export function fg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${CSI}38;2;${r};${g};${b}m`;
}

export function bg(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${CSI}48;2;${r};${g};${b}m`;
}

/** Wraps text in a foreground color, resetting only the foreground. */
export function color(hex: string, text: string): string {
  return `${fg(hex)}${text}${CSI}39m`;
}

export function bold(text: string): string {
  return `${CSI}1m${text}${CSI}22m`;
}

export function italic(text: string): string {
  return `${CSI}3m${text}${CSI}23m`;
}

export function underline(text: string): string {
  return `${CSI}4m${text}${CSI}24m`;
}

/** A colored block with its own background — badges, chips, key caps. */
export function badge(text: string, background: string, foreground: string): string {
  return `${bg(background)}${fg(foreground)}${text}${CSI}39m${CSI}49m`;
}

/**
 * OSC 8 hyperlink. The terminal's link handler decides what each scheme
 * does: http(s) opens a tab, `cmd:` runs a shell command, `dl:` downloads.
 */
export function link(uri: string, text: string): string {
  return `${OSC}8;;${uri}${BEL}${text}${OSC}8;;${BEL}`;
}

export function commandUri(command: string): string {
  return `cmd:${encodeURIComponent(command)}`;
}

// CSI sequences and OSC sequences (terminated by BEL or ST).
const ansiPattern = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

export function strip(text: string): string {
  return text.replace(ansiPattern, "");
}

/** Visible width in terminal cells. Shell content avoids wide glyphs. */
export function width(text: string): number {
  return [...strip(text)].length;
}

export function padEnd(text: string, size: number, fill = " "): string {
  const gap = size - width(text);
  return gap > 0 ? text + fill.repeat(gap) : text;
}

export function padStart(text: string, size: number, fill = " "): string {
  const gap = size - width(text);
  return gap > 0 ? fill.repeat(gap) + text : text;
}

/** Truncates plain text to `size` cells with an ellipsis. */
export function truncate(text: string, size: number): string {
  const characters = [...text];
  if (characters.length <= size) {
    return text;
  }
  return `${characters.slice(0, Math.max(0, size - 1)).join("")}…`;
}

/**
 * Greedy word wrap for plain text. Words longer than the width are hard
 * split so nothing ever overflows a box.
 */
export function wrap(text: string, size: number): string[] {
  const limit = Math.max(1, size);
  const lines: string[] = [];

  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while ([...rest].length > limit) {
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push([...rest].slice(0, limit).join(""));
        rest = [...rest].slice(limit).join("");
      }
      if (!line) {
        line = rest;
      } else if ([...line].length + 1 + [...rest].length <= limit) {
        line += ` ${rest}`;
      } else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }

  return lines;
}

/**
 * Wraps a list of pre-styled tokens (chips, links) into lines no wider than
 * `size`, separated by `gap`.
 */
export function flow(tokens: string[], size: number, gap = " "): string[] {
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    if (!line) {
      line = token;
    } else if (width(line) + width(gap) + width(token) <= size) {
      line += gap + token;
    } else {
      lines.push(line);
      line = token;
    }
  }
  if (line) {
    lines.push(line);
  }
  return lines;
}

export interface BoxOptions {
  width: number;
  title?: string;
  /** Right-aligned label in the top border. */
  meta?: string;
  /** Label in the bottom border. */
  footer?: string;
  border: string;
  padding?: number;
}

/**
 * A rounded TUI panel — the same shape as the site's HTML panels:
 *   ╭─ title ─────── meta ─╮
 *   │ content              │
 *   ╰─ footer ─────────────╯
 */
export function box(content: string[], options: BoxOptions): string[] {
  const { border, padding = 1 } = options;
  const inner = Math.max(4, options.width - 2);
  const line = (text: string) => color(border, text);

  const edge = (left: string, right: string, label?: string, meta?: string) => {
    const head = label ? `${line(`${left}─ `)}${label}${line(" ")}` : line(`${left}─`);
    const tail = meta ? `${line(" ")}${meta}${line(` ─${right}`)}` : line(`─${right}`);
    const fill = options.width - width(head) - width(tail);
    return `${head}${line("─".repeat(Math.max(0, fill)))}${tail}`;
  };

  const pad = " ".repeat(padding);
  const body = content.map(
    (text) =>
      `${line("│")}${pad}${padEnd(text, inner - padding * 2)}${pad}${line("│")}`,
  );

  return [
    edge("╭", "╮", options.title, options.meta),
    ...body,
    edge("╰", "╯", options.footer),
  ];
}

/** Places blocks of lines side by side, padding each to its own width. */
export function columns(blocks: string[][], gap = 2): string[] {
  const widths = blocks.map((block) => Math.max(0, ...block.map(width)));
  const height = Math.max(0, ...blocks.map((block) => block.length));
  const lines: string[] = [];
  for (let row = 0; row < height; row += 1) {
    lines.push(
      blocks
        .map((block, index) => padEnd(block[row] ?? "", widths[index] ?? 0))
        .join(" ".repeat(gap))
        .trimEnd(),
    );
  }
  return lines;
}

/**
 * Per-character horizontal gradient for banner art. Spaces are left
 * uncolored so the escape codes stay compact.
 */
export function gradient(
  text: string,
  from: string,
  to: string,
  options: { span?: number; shade?: { match: RegExp; toward: string; amount: number } } = {},
): string {
  const characters = [...text];
  const total = Math.max(1, (options.span ?? characters.length) - 1);
  const { shade } = options;
  return characters
    .map((character, index) => {
      if (character === " ") {
        return character;
      }
      const base = mix(from, to, index / total);
      const tone = shade && shade.match.test(character) ? mix(base, shade.toward, shade.amount) : base;
      return `${fg(tone)}${character}`;
    })
    .join("") + `${CSI}39m`;
}

/**
 * Semantic palette bound to a theme. Renderers only use these names, never
 * raw colors, so every theme reads correctly.
 */
export function palette(theme: Theme) {
  return {
    theme,
    text: (value: string) => color(theme.text, value),
    muted: (value: string) => color(theme.muted, value),
    faint: (value: string) => color(theme.faint, value),
    accent: (value: string) => color(theme.accent, value),
    accent2: (value: string) => color(theme.accent2, value),
    red: (value: string) => color(theme.red, value),
    green: (value: string) => color(theme.green, value),
    yellow: (value: string) => color(theme.yellow, value),
    blue: (value: string) => color(theme.blue, value),
    magenta: (value: string) => color(theme.magenta, value),
    cyan: (value: string) => color(theme.cyan, value),
    bold,
    italic,
    underline,
    /** Inverse accent badge, e.g. section headings. */
    heading: (value: string) => bold(badge(` ${value} `, theme.accent, theme.onAccent)),
    chip: (value: string) => badge(` ${value} `, theme.raised, theme.muted),
    key: (value: string) => badge(` ${value} `, theme.raised, theme.text),
    /** A clickable command: runs `command` when clicked. */
    cmd: (command: string, label = command) =>
      link(commandUri(command), color(theme.accent, label)),
    /** A clickable URL in the link color. */
    url: (href: string, label: string) => link(href, color(theme.cyan, label)),
  };
}

export type Palette = ReturnType<typeof palette>;
