import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { experience, profile, projects } from "../../data/site";
import { xtermTheme, type Theme } from "../themes";
import { color, palette, strip, width } from "./ansi";
import {
  classify,
  commonPrefix,
  completionToken,
  defaultEnv,
  execute,
  getCompletions,
  suggest,
} from "./commands";
import {
  createState,
  decodeInput,
  edit,
  placeCursor,
  rowsFor,
  valueOf,
  type EditorState,
  type Key,
} from "./line-editor";
import { lines, message } from "./render";
import type {
  LiveLine,
  PortraitCell,
  PromptOptions,
  Renderable,
  RenderContext,
  ShellAssets,
  ShellIO,
} from "./types";
import { HOME, displayPath } from "./vfs";

export interface HostCallbacks {
  onThemeChange(theme: Theme): void;
  onCrtChange(on: boolean): void;
  onSize(cols: number, rows: number): void;
  onHover(description: string | null): void;
  onScrollState(atBottom: boolean): void;
  onExit(exited: boolean): void;
  /** Esc pressed: move focus out of the terminal. */
  onEscape(): void;
  announce(text: string): void;
}

export interface HostOptions {
  theme: Theme;
  crt: boolean;
  reducedMotion: boolean;
  /** Command to run after the welcome screen (from `/?run=`). */
  initialCommand?: string | null;
}

interface ActivePrompt {
  options: PromptOptions;
  state: EditorState;
  /** Rows between the top of the drawn region and the cursor. */
  row: number;
  shell: boolean;
  historyIndex: number | null;
  historyMatches: string[];
  draft: string;
  error: string | null;
  resolve: (value: string | null) => void;
}

interface QueuedCommand {
  command: string;
  animate: boolean;
  /** Startup commands (the welcome screen, deep links) skip the history. */
  remember: boolean;
}

const FONT_FAMILY = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const HISTORY_KEY = "wsh:history";
const LOGIN_KEY = "wsh:last-login";
const SESSION_KEY = "wsh:session";

function storage(kind: "local" | "session"): Storage | null {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Font size by container width: compact on phones, roomy on big screens. */
function fontSizeFor(widthPx: number): number {
  if (widthPx < 420) return 12;
  if (widthPx < 640) return 13;
  if (widthPx < 1500) return 14;
  return 15;
}

/**
 * Turns the profile photo into half-block cells: each terminal cell shows
 * two vertically stacked pixels (▀ with fg = top, bg = bottom). The light
 * studio background is flood-filled away from the edges, so the portrait
 * sits directly on the terminal background.
 */
async function loadPortrait(src: string, cols: number, rows: number): Promise<PortraitCell[][] | undefined> {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();

  const scale = 3;
  const w = cols * scale;
  const h = rows * 2 * scale;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return undefined;
  }
  context.imageSmoothingQuality = "high";
  // Crop a little: the face sits in the upper-middle of the photo.
  const crop = image.naturalWidth * 0.08;
  context.drawImage(image, crop, 0, image.naturalWidth - crop * 2, image.naturalHeight - crop, 0, 0, w, h);
  const { data } = context.getImageData(0, 0, w, h);

  // Studio backdrop: light and nearly colorless (skin is warmer, the
  // shirt and hair are dark). Teeth and glasses highlights match too, but
  // the fill only spreads from the edges, so they stay.
  const isBackground = (index: number) => {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    const max = Math.max(r, g, b);
    return max > 160 && max - Math.min(r, g, b) < 24;
  };
  const background = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x += 1) {
    stack.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    stack.push(y * w, y * w + w - 1);
  }
  while (stack.length) {
    const pixel = stack.pop()!;
    if (background[pixel] || !isBackground(pixel * 4)) {
      continue;
    }
    background[pixel] = 1;
    const x = pixel % w;
    if (x > 0) stack.push(pixel - 1);
    if (x < w - 1) stack.push(pixel + 1);
    if (pixel >= w) stack.push(pixel - w);
    if (pixel < w * (h - 1)) stack.push(pixel + w);
  }

  const sample = (cellX: number, pixelY: number): string | null => {
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let dy = 0; dy < scale; dy += 1) {
      for (let dx = 0; dx < scale; dx += 1) {
        const pixel = (pixelY * scale + dy) * w + cellX * scale + dx;
        if (!background[pixel]) {
          r += data[pixel * 4]!;
          g += data[pixel * 4 + 1]!;
          b += data[pixel * 4 + 2]!;
          count += 1;
        }
      }
    }
    if (count < (scale * scale) / 2) {
      return null;
    }
    const hex = (value: number) => Math.round(value / count).toString(16).padStart(2, "0");
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  };

  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col): PortraitCell => [sample(col, row * 2), sample(col, row * 2 + 1)]),
  );
}

export class ShellHost {
  readonly term: Terminal;
  private readonly fit = new FitAddon();
  private readonly callbacks: HostCallbacks;
  private readonly reducedMotion: boolean;
  private readonly container: HTMLElement;

  private theme: Theme;
  private crt: boolean;
  private assets: ShellAssets = {};
  /** True while WebGL draws box/block glyphs itself (they join seamlessly). */
  private customGlyphs = false;
  private transcript: Renderable[] = [];
  private history: string[] = [];
  private cwd = HOME;
  private previousCwd = HOME;
  private lastStatus = 0;

  private active: ActivePrompt | undefined;
  private busy = false;
  private feeding = false;
  private animating = false;
  private skip = false;
  private exited = false;
  private restart: (() => void) | undefined;
  private queue: QueuedCommand[] = [];
  private rememberNext = true;
  /** Keystrokes that arrive while no prompt is listening (typeahead). */
  private typeahead = "";
  private controller = new AbortController();
  private pendingRelayout = false;
  private lastCols = 0;
  private relayoutTimer: number | undefined;
  private scrollTarget: number | null = null;
  private commitStart = 0;
  private clearEpoch = 0;
  private disposed = false;
  private resizeObserver: ResizeObserver | undefined;
  private initialCommand: string | null;

  constructor(container: HTMLElement, options: HostOptions, callbacks: HostCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.theme = options.theme;
    this.crt = options.crt;
    this.reducedMotion = options.reducedMotion;
    this.initialCommand = options.initialCommand ?? null;

    const saved = storage("local")?.getItem(HISTORY_KEY);
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          this.history = parsed.filter((entry): entry is string => typeof entry === "string").slice(-200);
        }
      } catch {
        // Corrupt history is simply dropped.
      }
    }

    this.term = new Terminal({
      fontFamily: FONT_FAMILY,
      fontSize: fontSizeFor(container.clientWidth),
      lineHeight: 1.2,
      fontWeight: "400",
      fontWeightBold: "700",
      cursorBlink: !options.reducedMotion,
      cursorStyle: "block",
      cursorInactiveStyle: "outline",
      scrollback: 5000,
      allowProposedApi: false,
      drawBoldTextInBrightColors: false,
      macOptionIsMeta: true,
      theme: xtermTheme(options.theme),
      linkHandler: {
        allowNonHttpProtocols: true,
        activate: (event, uri) => {
          event.preventDefault();
          this.activateLink(uri);
        },
        hover: (_, uri) => this.callbacks.onHover(this.describeLink(uri)),
        leave: () => this.callbacks.onHover(null),
      },
    });
    this.term.loadAddon(this.fit);
  }

  /* ----------------------------------------------------------------
     Lifecycle
  ---------------------------------------------------------------- */
  async start(): Promise<void> {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 14px "JetBrains Mono Variable"`),
        document.fonts.load(`700 14px "JetBrains Mono Variable"`),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]).catch(() => undefined);
    if (this.disposed) {
      return;
    }

    this.term.open(this.container);
    await this.loadWebgl();

    this.term.attachCustomKeyEventHandler((event) => this.keyFilter(event));
    this.term.onData((data) => this.handleData(data));
    this.term.onScroll(() => this.reportScroll());
    this.term.onWriteParsed(() => this.reportScroll());

    this.fitNow();
    this.resizeObserver = new ResizeObserver(() => this.fitNow());
    this.resizeObserver.observe(this.container);

    if (profile.photo) {
      try {
        const portrait = await loadPortrait(profile.photo, 26, 13);
        if (portrait) {
          this.assets.portrait = portrait;
        }
      } catch {
        // No portrait — neofetch just shows the facts.
      }
    }

    if (window.matchMedia("(pointer: fine)").matches) {
      this.term.focus();
    }

    await this.boot();
    void this.loop();
  }

  /**
   * WebGL draws box-drawing and block characters as pixel-perfect custom
   * glyphs. It sizes its canvas from ResizeObserver's device-pixel box; if
   * that disagrees with CSS size × devicePixelRatio (seen under device
   * emulation), the canvas would be mis-scaled — fall back to the DOM
   * renderer, which is always correct.
   */
  private async loadWebgl(): Promise<void> {
    try {
      const { WebglAddon } = await import("@xterm/addon-webgl");
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => this.useDomRenderer(webgl));
      this.term.loadAddon(webgl);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const canvas = this.container.querySelector<HTMLCanvasElement>(".xterm-screen canvas:not(.xterm-link-layer)");
      const expected = (canvas?.clientWidth ?? 0) * window.devicePixelRatio;
      if (!canvas || Math.abs(canvas.width - expected) > Math.max(4, expected * 0.05)) {
        this.useDomRenderer(webgl);
        return;
      }
      this.customGlyphs = true;
    } catch {
      // No WebGL: the DOM renderer is already in place.
    }
  }

  private useDomRenderer(webgl: { dispose(): void }): void {
    webgl.dispose();
    if (this.customGlyphs) {
      this.customGlyphs = false;
      this.relayout();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.controller.abort();
    this.resizeObserver?.disconnect();
    window.clearTimeout(this.relayoutTimer);
    this.term.dispose();
  }

  focus(): void {
    this.term.focus();
  }

  /** Starts a new session after `exit`. */
  wake(): void {
    this.restart?.();
    this.term.focus();
  }

  scrollToBottom(): void {
    this.term.scrollToBottom();
    this.term.focus();
  }

  /** Theme changed elsewhere (the top bar picker). */
  applyTheme(theme: Theme): void {
    if (theme.id === this.theme.id) {
      return;
    }
    this.theme = theme;
    this.term.options.theme = xtermTheme(theme);
    this.relayout();
  }

  /**
   * Runs a command as if typed — from the function bar, side panels, or a
   * clicked link. Whatever is running gets interrupted first.
   */
  runCommand(command: string, animate = true): void {
    this.queue.push({ command, animate, remember: true });
    if (this.exited) {
      this.restart?.();
      return;
    }
    if (this.active?.shell) {
      if (!this.feeding) {
        void this.feedQueue();
      }
    } else if (this.active) {
      this.commit(this.active, true);
    } else if (this.busy) {
      this.controller.abort();
    }
  }

  /* ----------------------------------------------------------------
     Layout
  ---------------------------------------------------------------- */
  private fitNow(): void {
    if (this.disposed || !this.container.clientWidth) {
      return;
    }
    const size = fontSizeFor(this.container.clientWidth);
    if (this.term.options.fontSize !== size) {
      this.term.options.fontSize = size;
    }
    try {
      this.fit.fit();
    } catch {
      return;
    }
    this.callbacks.onSize(this.term.cols, this.term.rows);
    if (this.lastCols && this.term.cols !== this.lastCols) {
      window.clearTimeout(this.relayoutTimer);
      this.relayoutTimer = window.setTimeout(() => this.relayout(), 140);
    }
    this.lastCols = this.term.cols;
  }

  private context(): RenderContext {
    return {
      cols: this.term.cols,
      theme: this.theme,
      p: palette(this.theme),
      now: new Date(),
      assets: this.assets,
      customGlyphs: this.customGlyphs,
    };
  }

  private static toTerminal(rendered: string[]): string {
    return rendered.map((line) => `${line}\x1b[0m\r\n`).join("");
  }

  /** Re-renders the whole transcript at the current width and theme. */
  private relayout(): void {
    if (this.busy && !this.active) {
      this.pendingRelayout = true;
      return;
    }
    const context = this.context();
    let output = "\x1b[H\x1b[2J\x1b[3J";
    for (const render of this.transcript) {
      output += ShellHost.toTerminal(render(context));
    }
    this.term.write(output);
    this.clearEpoch += 1;
    if (this.active) {
      this.active.row = 0;
      this.draw(this.active);
    }
  }

  private record(render: Renderable, announce = false): void {
    this.transcript.push(render);
    const rendered = render(this.context());
    this.term.write(ShellHost.toTerminal(rendered));
    if (announce) {
      // Screen readers get the words, not the box drawing, banner art, or
      // portrait pixels.
      const text = strip(rendered.join("\n"))
        .replace(/[\u2500-\u259f]/g, " ")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
      this.callbacks.announce(text);
    }
  }

  private clearScreen(): void {
    this.transcript = [];
    this.clearEpoch += 1;
    this.term.write("\x1b[H\x1b[2J\x1b[3J");
  }

  private flush(): Promise<void> {
    return new Promise((resolve) => this.term.write("", resolve));
  }

  private cursorLine(): number {
    const buffer = this.term.buffer.active;
    return buffer.baseY + buffer.cursorY;
  }

  private reportScroll(): void {
    const buffer = this.term.buffer.active;
    this.callbacks.onScrollState(buffer.viewportY >= buffer.baseY);
  }

  /* ----------------------------------------------------------------
     Boot and main loop
  ---------------------------------------------------------------- */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (this.skip || ms <= 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const timer = window.setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          window.clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }

  private async boot(): Promise<void> {
    const session = storage("session");
    const local = storage("local");
    const firstInSession = !session?.getItem(SESSION_KEY);
    session?.setItem(SESSION_KEY, "1");
    const lastLogin = local?.getItem(LOGIN_KEY);
    local?.setItem(LOGIN_KEY, new Date().toISOString());

    if (firstInSession && !this.reducedMotion) {
      this.animating = true;
      const ok = (text: string): Renderable => (context: RenderContext) => [
        `${context.p.faint("[")}${context.p.green("  OK  ")}${context.p.faint("]")} ${context.p.muted(text)}`,
      ];
      const steps = [
        "Started wsh.service — the willibit shell.",
        "Mounted /home/visitor (read-only).",
        `Loaded ${experience.length} roles, ${projects.length} projects, 1 degree.`,
        "Reached target portfolio.target.",
      ];
      for (const step of steps) {
        this.record(ok(step));
        await this.sleep(70 + Math.random() * 90);
      }
      await this.sleep(260);
      this.clearScreen();
      this.animating = false;
      this.skip = false;
    }

    const when = lastLogin ? new Date(lastLogin) : null;
    this.record((context) => [
      context.p.faint(
        when && !Number.isNaN(when.getTime())
          ? `Last login: ${when.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} on ttys001`
          : "Last login: never — welcome, first-time visitor",
      ),
    ]);

    this.queue.unshift({ command: "neofetch", animate: firstInSession && !this.reducedMotion, remember: false });
    if (this.initialCommand) {
      this.queue.push({ command: this.initialCommand, animate: false, remember: false });
    }
  }

  private shellPrompt(): PromptOptions {
    const cwd = this.cwd;
    const failed = this.lastStatus !== 0;
    const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
    const header = (context: RenderContext) => {
      const { p } = context;
      const left = ` ${p.bold(p.accent("visitor"))}${p.faint("@")}${p.bold(p.accent2("willibit"))} ${p.faint("in")} ${p.bold(p.yellow(displayPath(cwd)))}`;
      const right = p.faint(time);
      const gap = context.cols - width(left) - width(right) - 1;
      return ["", gap >= 2 && context.cols >= 56 ? `${left}${" ".repeat(gap)}${right}` : left];
    };
    const prompt = (context: RenderContext) => ` ${failed ? context.p.red("❯") : context.p.accent("❯")} `;
    const highlight = (value: string, context: RenderContext) => this.highlight(value, context);
    return {
      header,
      prompt,
      highlight,
      history: true,
      final: (value, context) => [...header(context), prompt(context) + highlight(value, context)],
      suggest: (value) => suggest(value, this.history, { cwd: this.cwd }),
      complete: (value) => ({
        before: completionToken(value).before,
        candidates: getCompletions(value, { cwd: this.cwd }),
      }),
    };
  }

  private highlight(value: string, context: RenderContext): string {
    const { p } = context;
    return classify(value, { cwd: this.cwd })
      .map(({ text, kind }) => {
        switch (kind) {
          case "command":
            return p.accent(text);
          case "unknown":
            return p.red(text);
          case "path":
            return p.underline(p.text(text));
          case "flag":
            return p.cyan(text);
          case "string":
            return p.yellow(text);
          case "operator":
            return p.magenta(text);
          default:
            return p.text(text);
        }
      })
      .join("");
  }

  private async loop(): Promise<void> {
    while (!this.disposed) {
      const line = await this.readLine(this.shellPrompt(), true);
      if (this.disposed) {
        return;
      }
      if (line === null || !line.trim()) {
        continue;
      }
      if (this.rememberNext) {
        this.pushHistory(line.trim());
      }
      this.rememberNext = true;
      await this.runLine(line.trim());

      if (this.exited) {
        await new Promise<void>((resolve) => {
          this.restart = resolve;
        });
        this.restart = undefined;
        this.exited = false;
        this.callbacks.onExit(false);
        this.clearScreen();
        this.cwd = HOME;
        this.lastStatus = 0;
        this.queue.unshift({ command: "neofetch", animate: false, remember: false });
      }
    }
  }

  private pushHistory(line: string): void {
    if (this.history.at(-1) !== line) {
      this.history.push(line);
    }
    this.history = this.history.slice(-200);
    storage("local")?.setItem(HISTORY_KEY, JSON.stringify(this.history));
  }

  private async runLine(line: string): Promise<void> {
    const start = this.commitStart;
    const epoch = this.clearEpoch;
    this.busy = true;
    this.controller = new AbortController();
    const { signal } = this.controller;

    let status: number;
    try {
      status = await execute(line, this.makeIO(signal));
    } catch (error) {
      this.record(message("error", `wsh: ${error instanceof Error ? error.message : "something went wrong"}`));
      status = 1;
    }
    if (signal.aborted) {
      this.record((context) => [` ${context.p.faint("^C")}`]);
      status = 130;
    }
    this.busy = false;
    this.lastStatus = status;
    if (this.pendingRelayout) {
      this.pendingRelayout = false;
      this.relayout();
    }

    // Long output: show it from the top; the next keystroke jumps back down.
    await this.flush();
    if (epoch === this.clearEpoch && this.cursorLine() - start > this.term.rows - 2) {
      this.scrollTarget = start;
    }
  }

  private makeIO(signal: AbortSignal): ShellIO {
    const host = this;
    return {
      get cols() {
        return host.term.cols;
      },
      get cwd() {
        return host.cwd;
      },
      get previousCwd() {
        return host.previousCwd;
      },
      get theme() {
        return host.theme;
      },
      get crt() {
        return host.crt;
      },
      get history() {
        return host.history;
      },
      get env() {
        return defaultEnv(host.cwd, host.theme.id);
      },
      signal,
      print: (output) => {
        const render: Renderable = Array.isArray(output) ? () => output : output;
        this.record(render, true);
      },
      clear: () => this.clearScreen(),
      readLine: (options) => (signal.aborted ? Promise.resolve(null) : this.readLine(options, false)),
      sleep: (ms) => this.sleep(ms, signal),
      live: () => this.live(),
      setCwd: (path) => {
        this.previousCwd = this.cwd;
        this.cwd = path;
      },
      setTheme: (theme) => {
        this.theme = theme;
        this.term.options.theme = xtermTheme(theme);
        this.callbacks.onThemeChange(theme);
        this.relayout();
      },
      setCrt: (on) => {
        this.crt = on;
        this.callbacks.onCrtChange(on);
      },
      navigate: (href) => {
        void this.flush().then(() => window.setTimeout(() => window.location.assign(href), 320));
      },
      openUrl: (href) => this.openUrl(href),
      download: (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      },
      fetch: (href) => window.fetch(href, { signal }),
      copy: async (text) => {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return false;
        }
      },
      exit: () => {
        this.exited = true;
        this.record((context) => [
          ` ${context.p.muted("logout")}`,
          ` ${context.p.faint("Saving session... completed.")}`,
          "",
          ` ${context.p.faint("[Process completed]")}`,
        ]);
        this.callbacks.onExit(true);
      },
    };
  }

  private live(): LiveLine {
    let text = "";
    return {
      update: (next) => {
        text = next;
        this.term.write(`\r\x1b[2K${text}\x1b[0m`);
      },
      done: (final) => {
        this.term.write("\r\x1b[2K");
        this.record(final);
        text = "";
      },
    };
  }

  /* ----------------------------------------------------------------
     Line editing
  ---------------------------------------------------------------- */
  private readLine(options: PromptOptions, shell: boolean): Promise<string | null> {
    return new Promise((resolve) => {
      const prompt: ActivePrompt = {
        options,
        state: createState(options.initial),
        row: 0,
        shell,
        historyIndex: null,
        historyMatches: [],
        draft: "",
        error: null,
        resolve,
      };
      this.active = prompt;
      this.draw(prompt);

      if (this.scrollTarget !== null) {
        const target = this.scrollTarget;
        this.scrollTarget = null;
        void this.flush().then(() => this.term.scrollToLine(target));
      }
      if (shell && this.queue.length > 0) {
        void this.feedQueue();
      } else {
        this.replayTypeahead(prompt);
      }
    });
  }

  private ghostFor(prompt: ActivePrompt): string {
    if (prompt.state.cursor !== prompt.state.chars.length || !prompt.options.suggest) {
      return "";
    }
    return prompt.options.suggest(valueOf(prompt.state));
  }

  private draw(prompt: ActivePrompt, showGhost = true): void {
    const context = this.context();
    const cols = this.term.cols;
    const header = prompt.options.header?.(context, prompt.error) ?? [];
    const promptText = prompt.options.prompt(context);
    const value = valueOf(prompt.state);
    const highlighted = prompt.options.highlight?.(value, context) ?? color(this.theme.text, value);
    const ghost = showGhost && !this.feeding ? this.ghostFor(prompt) : "";

    let output = prompt.row > 0 ? `\x1b[${prompt.row}A` : "";
    output += "\r\x1b[J";
    for (const line of header) {
      output += `${line}\x1b[0m\r\n`;
    }
    output += `${promptText}\x1b[0m${highlighted}\x1b[0m`;
    if (ghost) {
      output += `${color(this.theme.faint, ghost)}\x1b[0m`;
    }
    const headerRows = header.reduce((total, line) => total + rowsFor(width(line), cols), 0);
    const move = placeCursor(width(promptText), prompt.state.chars.length + [...ghost].length, prompt.state.cursor, cols);
    output += move.sequence;
    prompt.row = headerRows + move.row;
    this.term.write(output);
  }

  /** Replaces the editing region with its final form and resolves. */
  private commit(prompt: ActivePrompt, cancelled: boolean): void {
    if (this.active !== prompt) {
      return;
    }
    this.active = undefined;
    const value = valueOf(prompt.state);
    const { options } = prompt;
    const final: Renderable = (context) => {
      if (cancelled) {
        const header = options.header?.(context, null) ?? [];
        const typed = options.highlight?.(value, context) ?? context.p.text(value);
        return [...header, `${options.prompt(context)}${typed}${context.p.faint("^C")}`];
      }
      return options.final?.(value, context) ?? [
        ...(options.header?.(context, null) ?? []),
        `${options.prompt(context)}${options.highlight?.(value, context) ?? context.p.text(value)}`,
      ];
    };

    void this.flush().then(() => {
      this.commitStart = this.cursorLine() - prompt.row;
      this.term.write(`${prompt.row > 0 ? `\x1b[${prompt.row}A` : ""}\r\x1b[J`);
      this.record(final);
      prompt.resolve(cancelled ? null : value);
    });
  }

  /** Prints above the prompt (e.g. completion candidates), bash-style. */
  private printAbove(prompt: ActivePrompt, render: Renderable): void {
    const value = valueOf(prompt.state);
    const { options } = prompt;
    this.term.write(`${prompt.row > 0 ? `\x1b[${prompt.row}A` : ""}\r\x1b[J`);
    this.record((context) => [
      ...(options.header?.(context, null) ?? []),
      `${options.prompt(context)}${options.highlight?.(value, context) ?? value}`,
    ]);
    this.record(render);
    prompt.row = 0;
    this.draw(prompt);
  }

  private async feedQueue(): Promise<void> {
    const prompt = this.active;
    if (!prompt?.shell || this.feeding) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      return;
    }
    this.feeding = true;
    if (next.animate && !this.reducedMotion) {
      await this.sleep(240);
      prompt.state = createState("");
      for (const character of next.command) {
        if (this.skip || this.active !== prompt) {
          break;
        }
        prompt.state = edit(prompt.state, { type: "text", text: character });
        this.draw(prompt);
        await this.sleep(22 + Math.random() * 42);
      }
      await this.sleep(150);
    }
    this.feeding = false;
    this.skip = false;
    if (this.active !== prompt) {
      return;
    }
    this.rememberNext = next.remember;
    prompt.state = createState(next.command);
    this.draw(prompt, false);
    this.commit(prompt, false);
  }

  private handleData(data: string): void {
    if (this.exited) {
      this.restart?.();
      return;
    }
    if (this.animating || this.feeding) {
      // The first keypress fast-forwards the animation; anything typed
      // after it is kept for the next prompt, like a real typeahead.
      if (this.skip) {
        this.typeahead += data;
      }
      this.skip = true;
      return;
    }
    const prompt = this.active;
    if (!prompt) {
      if (this.busy && data.includes("\x03")) {
        this.typeahead = "";
        this.controller.abort();
      } else {
        this.typeahead += data;
      }
      return;
    }
    this.handleKeys(prompt, decodeInput(data));
  }

  private replayTypeahead(prompt: ActivePrompt): void {
    if (!this.typeahead || this.active !== prompt) {
      return;
    }
    const data = this.typeahead;
    this.typeahead = "";
    this.handleKeys(prompt, decodeInput(data));
  }

  private handleKeys(prompt: ActivePrompt, keys: Key[]): void {
    for (const key of keys) {
      const atEnd = prompt.state.cursor === prompt.state.chars.length;
      switch (key.type) {
        case "enter": {
          const error = prompt.options.validate?.(valueOf(prompt.state)) ?? null;
          if (error) {
            prompt.error = error;
            break;
          }
          prompt.error = null;
          this.draw(prompt, false);
          this.commit(prompt, false);
          return;
        }
        case "interrupt":
          this.draw(prompt, false);
          this.commit(prompt, true);
          return;
        case "eof":
          if (prompt.shell && prompt.state.chars.length === 0) {
            prompt.state = createState("exit");
            this.draw(prompt, false);
            this.commit(prompt, false);
            return;
          }
          prompt.state = edit(prompt.state, key);
          break;
        case "clearScreen":
          this.clearScreen();
          prompt.row = 0;
          break;
        case "tab":
          this.complete(prompt);
          break;
        case "up":
        case "down":
          if (prompt.options.history) {
            this.walkHistory(prompt, key.type === "up" ? 1 : -1);
          }
          break;
        case "right":
        case "end": {
          const ghost = this.ghostFor(prompt);
          if (atEnd && ghost) {
            prompt.state = edit(prompt.state, { type: "text", text: ghost });
          } else {
            prompt.state = edit(prompt.state, key);
          }
          break;
        }
        case "escape":
          break;
        default:
          prompt.state = edit(prompt.state, key);
          if (key.type === "text" || key.type === "backspace" || key.type === "delete" || key.type.startsWith("kill")) {
            prompt.historyIndex = null;
          }
      }
    }
    this.draw(prompt);
  }

  private walkHistory(prompt: ActivePrompt, direction: 1 | -1): void {
    if (prompt.historyIndex === null) {
      if (direction === -1) {
        return;
      }
      prompt.draft = valueOf(prompt.state);
      const seen = new Set<string>();
      prompt.historyMatches = [...this.history]
        .reverse()
        .filter((entry) => entry.startsWith(prompt.draft) && !seen.has(entry) && seen.add(entry));
      if (prompt.historyMatches.length === 0) {
        return;
      }
      prompt.historyIndex = 0;
    } else {
      const next = prompt.historyIndex + direction;
      if (next < 0) {
        prompt.historyIndex = null;
        prompt.state = createState(prompt.draft);
        return;
      }
      prompt.historyIndex = Math.min(prompt.historyMatches.length - 1, next);
    }
    prompt.state = createState(prompt.historyMatches[prompt.historyIndex] ?? prompt.draft);
  }

  private complete(prompt: ActivePrompt): void {
    if (!prompt.options.complete) {
      return;
    }
    const before = prompt.state.chars.slice(0, prompt.state.cursor).join("");
    const after = prompt.state.chars.slice(prompt.state.cursor).join("");
    const { candidates } = prompt.options.complete(before);
    const { before: head, token } = completionToken(before);
    if (candidates.length === 0) {
      return;
    }
    const apply = (replacement: string) => {
      const next = createState(`${head}${replacement}${after}`);
      next.cursor = [...`${head}${replacement}`].length;
      prompt.state = next;
    };
    const [only] = candidates;
    if (candidates.length === 1 && only !== undefined) {
      apply(only.endsWith("/") ? only : `${only} `);
      return;
    }
    const prefix = commonPrefix(candidates);
    if (prefix.length > token.length) {
      apply(prefix);
      return;
    }
    this.printAbove(
      prompt,
      lines((context) => {
        const cell = Math.max(...candidates.map((candidate) => candidate.length)) + 2;
        const perRow = Math.max(1, Math.floor((context.cols - 2) / cell));
        const rows: string[] = [];
        for (let index = 0; index < candidates.length; index += perRow) {
          rows.push(
            candidates
              .slice(index, index + perRow)
              .map((candidate) => context.p.muted(candidate.padEnd(cell)))
              .join("")
              .trimEnd(),
          );
        }
        return rows;
      }),
    );
  }

  /** Lets the browser keep its own shortcuts (reload, devtools, copy). */
  private keyFilter(event: KeyboardEvent): boolean {
    if (event.type !== "keydown") {
      return true;
    }
    // Tab completes, so keyboard users need a way out: Shift+Tab moves focus
    // back (browser default), Esc jumps forward to the quick-command bar.
    if (event.key === "Tab" && event.shiftKey) {
      return false;
    }
    if (event.key === "Escape" && !this.feeding && !this.animating) {
      this.callbacks.onEscape();
      return false;
    }
    if (event.metaKey || /^F\d{1,2}$/.test(event.key)) {
      return false;
    }
    if (event.ctrlKey && event.shiftKey) {
      return false;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "r") {
      return false;
    }
    // Ctrl+C copies when there is a selection, and interrupts otherwise.
    if (event.ctrlKey && event.key.toLowerCase() === "c" && this.term.hasSelection()) {
      return false;
    }
    if (event.ctrlKey && event.key.toLowerCase() === "v") {
      return false;
    }
    return true;
  }

  /* ----------------------------------------------------------------
     Links
  ---------------------------------------------------------------- */
  private describeLink(uri: string): string {
    if (uri.startsWith("cmd:")) {
      return `run ${decodeURIComponent(uri.slice(4))}`;
    }
    if (uri.startsWith("dl:")) {
      return `download ${uri.slice(3).replace(/^\//, "")}`;
    }
    if (uri.startsWith("mailto:")) {
      return `email ${uri.slice(7)}`;
    }
    if (uri.startsWith("/")) {
      return `open ${window.location.host}${uri}`;
    }
    return `open ${uri.replace(/^https?:\/\/(www\.)?/, "")} ↗`;
  }

  private activateLink(uri: string): void {
    if (uri.startsWith("cmd:")) {
      this.runCommand(decodeURIComponent(uri.slice(4)));
      return;
    }
    if (uri.startsWith("dl:")) {
      const anchor = document.createElement("a");
      anchor.href = uri.slice(3);
      anchor.download = uri.slice(3).split("/").pop() ?? "";
      anchor.click();
      return;
    }
    this.openUrl(uri);
  }

  private openUrl(href: string): void {
    if (href.startsWith("mailto:")) {
      window.location.href = href;
      return;
    }
    if (href.startsWith("/")) {
      if (/\.\w+$/.test(href)) {
        window.open(href, "_blank", "noopener");
      } else {
        window.location.assign(href);
      }
      return;
    }
    if (/^https?:\/\//.test(href)) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }
}
