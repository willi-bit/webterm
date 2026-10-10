import type { Theme } from "../themes";
import type { Palette } from "./ansi";

/** One terminal cell of the half-block portrait: top and bottom pixel. */
export type PortraitCell = [top: string | null, bottom: string | null];

export interface ShellAssets {
  /** Rows of half-block cells, generated from the profile photo. */
  portrait?: PortraitCell[][];
}

export interface RenderContext {
  cols: number;
  theme: Theme;
  p: Palette;
  now: Date;
  assets: ShellAssets;
  /**
   * Whether box-drawing glyphs join seamlessly (WebGL custom glyphs). With
   * font glyphs they leave gaps, so banner art drops its outline strokes.
   */
  customGlyphs?: boolean;
}

/**
 * Output is a function of the terminal width and theme, so the transcript
 * can be laid out again when either changes. Returns lines without newlines.
 */
export type Renderable = (context: RenderContext) => string[];

export interface PromptOptions {
  /**
   * Lines above the input (e.g. the first line of the shell prompt). Gets
   * the current validation error, if any.
   */
  header?: (context: RenderContext, error: string | null) => string[];
  /** Returns an error to keep the prompt open, or null to accept. */
  validate?: (value: string) => string | null;
  /** Text before the input on the input line. */
  prompt: (context: RenderContext) => string;
  /** How the finished prompt is kept in the transcript. */
  final?: (value: string, context: RenderContext) => string[];
  /** Syntax highlighting for the typed text. */
  highlight?: (value: string, context: RenderContext) => string;
  /** Grey inline suggestion shown after the cursor. */
  suggest?: (value: string) => string;
  /** Tab completion: returns candidate replacements for the input. */
  complete?: (value: string) => { before: string; candidates: string[] };
  /** Whether ↑/↓ walk the command history. */
  history?: boolean;
  /** Prefilled value. */
  initial?: string;
}

export interface LiveLine {
  update(text: string): void;
  /** Freezes the line into the transcript. */
  done(final: Renderable): void;
}

/**
 * Everything a command may do. The browser host implements it on top of
 * xterm.js; tests implement it in memory.
 */
export interface ShellIO {
  readonly cols: number;
  readonly cwd: string;
  readonly previousCwd: string;
  readonly theme: Theme;
  readonly crt: boolean;
  readonly history: readonly string[];
  readonly signal: AbortSignal;
  readonly env: Readonly<Record<string, string>>;
  print(output: Renderable | string[]): void;
  clear(): void;
  readLine(options: PromptOptions): Promise<string | null>;
  sleep(ms: number): Promise<void>;
  live(): LiveLine;
  setCwd(path: string): void;
  setTheme(theme: Theme): void;
  setCrt(on: boolean): void;
  navigate(href: string): void;
  openUrl(href: string): void;
  download(blob: Blob, filename: string): void;
  fetch(href: string): Promise<Response>;
  copy(text: string): Promise<boolean>;
  exit(): void;
}

export type CommandGroup = "portfolio" | "system" | "hidden";

export interface CompletionContext {
  cwd: string;
}

export interface Command {
  name: string;
  aliases?: string[];
  group: CommandGroup;
  summary: string;
  usage?: string;
  /** Longer text for `man`. */
  details?: string[];
  /** Candidates for the argument currently being typed. */
  complete?: (args: string[], context: CompletionContext) => string[];
  run: (args: string[], io: ShellIO) => number | void | Promise<number | void>;
}
