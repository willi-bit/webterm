import { describe, expect, it } from "vitest";
import { experience, profile, projects } from "../../data/site";
import { defaultTheme, findTheme, themeStylesheet, themes } from "../themes";
import { box, flow, palette, strip, width, wrap } from "./ansi";
import {
  classify,
  closestCommand,
  commonPrefix,
  completionToken,
  defaultEnv,
  execute,
  expandVariables,
  getCompletions,
  parseCommand,
  splitChain,
  suggest,
  tokenize,
} from "./commands";
import { createState, decodeInput, edit, placeCursor, valueOf } from "./line-editor";
import { neofetch, shortHash } from "./render";
import type { PromptOptions, Renderable, RenderContext, ShellIO } from "./types";
import { HOME, completePath, displayPath, lookup, resolvePath } from "./vfs";

/* ------------------------------------------------------------------
   An in-memory ShellIO: renders output at a fixed width, plain text.
------------------------------------------------------------------ */
function context(cols = 100): RenderContext {
  return { cols, theme: defaultTheme, p: palette(defaultTheme), now: new Date("2026-10-10T12:00:00Z"), assets: {} };
}

function createIO(options: { cols?: number; answers?: (string | null)[] } = {}) {
  const output: string[] = [];
  const answers = [...(options.answers ?? [])];
  const state = {
    cwd: HOME,
    previousCwd: HOME,
    theme: defaultTheme,
    crt: false,
    cleared: false,
    navigated: null as string | null,
    opened: [] as string[],
    exited: false,
  };
  const controller = new AbortController();
  const render = (item: Renderable | string[]) =>
    (Array.isArray(item) ? item : item(context(options.cols))).map(strip).join("\n");

  const io: ShellIO = {
    get cols() {
      return options.cols ?? 100;
    },
    get cwd() {
      return state.cwd;
    },
    get previousCwd() {
      return state.previousCwd;
    },
    get theme() {
      return state.theme;
    },
    get crt() {
      return state.crt;
    },
    history: ["help", "projects"],
    signal: controller.signal,
    get env() {
      return defaultEnv(state.cwd, state.theme.id);
    },
    print: (item) => output.push(render(item)),
    clear: () => {
      state.cleared = true;
    },
    readLine: async (prompt: PromptOptions) => {
      for (;;) {
        const answer = answers.shift() ?? null;
        if (answer === null) {
          return null;
        }
        if (!prompt.validate?.(answer)) {
          return answer;
        }
      }
    },
    sleep: async () => undefined,
    live: () => ({ update: () => undefined, done: (final) => output.push(render(final)) }),
    setCwd: (path) => {
      state.previousCwd = state.cwd;
      state.cwd = path;
    },
    setTheme: (theme) => {
      state.theme = theme;
    },
    setCrt: (on) => {
      state.crt = on;
    },
    navigate: (href) => {
      state.navigated = href;
    },
    openUrl: (href) => state.opened.push(href),
    download: () => undefined,
    fetch: () => Promise.reject(new Error("offline")),
    copy: async () => true,
    exit: () => {
      state.exited = true;
    },
  };
  return { io, output, state, text: () => output.join("\n") };
}

async function run(line: string, options?: Parameters<typeof createIO>[0]) {
  const shell = createIO(options);
  const status = await execute(line, shell.io);
  return { ...shell, status };
}

/* ------------------------------------------------------------------
   Parsing
------------------------------------------------------------------ */
describe("parsing", () => {
  it("normalizes the command name and keeps argument casing", () => {
    expect(parseCommand("  EcHo Hello World  ")).toEqual({ name: "echo", args: ["Hello", "World"] });
  });

  it("supports quoted arguments, including empty ones", () => {
    expect(tokenize(`echo "hello world" '' x`)).toEqual(["echo", "hello world", "", "x"]);
  });

  it("splits command chains and remembers the operator", () => {
    expect(splitChain("cd projects && ls ; pwd")).toEqual([
      { command: "cd projects", join: null },
      { command: "ls", join: "&&" },
      { command: "pwd", join: ";" },
    ]);
    expect(splitChain(`echo "a && b"`)).toEqual([{ command: `echo "a && b"`, join: null }]);
  });

  it("expands environment variables", () => {
    expect(expandVariables("hi $USER from ${SHELL}", { USER: "visitor", SHELL: "/bin/wsh" })).toBe(
      "hi visitor from /bin/wsh",
    );
  });
});

/* ------------------------------------------------------------------
   Completion and suggestions
------------------------------------------------------------------ */
describe("completion", () => {
  const at = { cwd: HOME };

  it("completes command names", () => {
    expect(getCompletions("proj", at)).toEqual(["project", "projects"]);
    expect(getCompletions("neo", at)).toEqual(["neofetch"]);
  });

  it("keeps easter eggs out of completion", () => {
    expect(getCompletions("sud", at)).toEqual([]);
  });

  it("completes file arguments relative to the working directory", () => {
    expect(getCompletions("cat in", at)).toEqual(["intro.txt"]);
    expect(getCompletions("cat read", at)).toEqual(["README.md"]);
    expect(getCompletions("cat projects/web", at)).toEqual(["projects/webterm-portfolio/"]);
    expect(getCompletions("cat REA", { cwd: `${HOME}/projects/webterm-portfolio` })).toEqual(["README.md"]);
  });

  it("only offers directories to cd", () => {
    expect(getCompletions("cd ", at)).toEqual(["experience/", "projects/"]);
  });

  it("hides dotfiles unless the token starts with a dot", () => {
    expect(getCompletions("cat ", at)).not.toContain(".plan");
    expect(getCompletions("cat .", at)).toEqual([".plan"]);
  });

  it("completes executables by path", () => {
    expect(getCompletions("./co", at)).toEqual(["./contact.sh"]);
  });

  it("completes project slugs and theme names", () => {
    expect(getCompletions("project web", at)).toEqual(["webterm-portfolio"]);
    expect(getCompletions("theme dr", at)).toEqual(["dracula"]);
  });

  it("completes after a chain operator", () => {
    expect(getCompletions("cd projects && ls", at)).toEqual(["ls"]);
  });

  it("finds the shared prefix", () => {
    expect(commonPrefix(["project", "projects"])).toBe("project");
    expect(commonPrefix([])).toBe("");
  });

  it("splits the token at the caret", () => {
    expect(completionToken("cat in")).toEqual({ before: "cat ", token: "in" });
    expect(completionToken("cat ")).toEqual({ before: "cat ", token: "" });
  });

  it("suggests from history first, then completions", () => {
    expect(suggest("pro", ["projects", "help"], at)).toBe("jects");
    expect(suggest("neo", [], at)).toBe("fetch");
    expect(suggest("", ["help"], at)).toBe("");
  });

  it("guesses typos", () => {
    expect(closestCommand("projcts")).toBe("projects");
    expect(closestCommand("zzzzzz")).toBeUndefined();
  });

  it("classifies input for highlighting", () => {
    const kinds = classify("cat about.md -n 'x' && nope", at).filter((part) => part.kind !== "space");
    expect(kinds.map((part) => part.kind)).toEqual(["command", "path", "flag", "string", "operator", "unknown"]);
    expect(classify("proj", at)[0]?.kind).toBe("partial");
  });
});

/* ------------------------------------------------------------------
   Virtual filesystem
------------------------------------------------------------------ */
describe("filesystem", () => {
  it("resolves paths with ~, .., and trailing slashes", () => {
    expect(resolvePath(HOME, "projects/../experience/")).toBe(`${HOME}/experience`);
    expect(resolvePath("/", "~")).toBe(HOME);
    expect(resolvePath(`${HOME}/projects`, "..")).toBe(HOME);
  });

  it("looks up nodes case-insensitively", () => {
    expect(lookup(`${HOME}/readme.md`)?.name).toBe("README.md");
    expect(lookup(`${HOME}/missing`)).toBeUndefined();
  });

  it("abbreviates the home directory", () => {
    expect(displayPath(`${HOME}/projects`)).toBe("~/projects");
    expect(displayPath("/home")).toBe("/home");
  });

  it("has one experience file per role and one folder per project", () => {
    expect(completePath(HOME, "experience/")).toHaveLength(experience.length);
    expect(completePath(HOME, "projects/")).toHaveLength(projects.length);
  });
});

/* ------------------------------------------------------------------
   Commands
------------------------------------------------------------------ */
describe("commands", () => {
  it("prints help with every portfolio command", async () => {
    const { text, status } = await run("help");
    expect(status).toBe(0);
    for (const command of ["about", "experience", "projects", "skills", "cv", "contact", ...(profile.email ? ["mail"] : [])]) {
      expect(text()).toContain(command);
    }
  });

  it("renders the welcome screen with the facts", async () => {
    const { text } = await run("neofetch");
    expect(text()).toContain("visitor@willibit");
    expect(text()).toContain("Full-Stack Software Engineer");
  });

  it("logs experience newest first, marking the current role as HEAD", async () => {
    const { text } = await run("experience");
    const output = text();
    expect(output).toContain("HEAD -> main");
    expect(output.indexOf("adesso")).toBeLessThan(output.indexOf("Data Management Team Lead"));
  });

  it("shows projects and project details", async () => {
    expect((await run("projects")).text()).toContain("Webterm Portfolio");
    expect((await run("project webterm-portfolio")).text()).toContain("xterm.js");
    const missing = await run("project nope");
    expect(missing.status).toBe(1);
    expect(missing.text()).toContain("not found");
  });

  it("navigates the filesystem", async () => {
    const shell = createIO();
    await execute("cd projects", shell.io);
    expect(shell.state.cwd).toBe(`${HOME}/projects`);
    await execute("cd -", shell.io);
    expect(shell.state.cwd).toBe(HOME);
    expect(await execute("cd nowhere", shell.io)).toBe(1);
    await execute("projects/", shell.io); // AUTO_CD
    expect(shell.state.cwd).toBe(`${HOME}/projects`);
  });

  it("lists files, long format, and hidden files", async () => {
    expect((await run("ls")).text()).toContain("projects/");
    expect((await run("ls")).text()).not.toContain(".plan");
    expect((await run("ls -la")).text()).toContain(".plan");
    expect((await run("ls -l")).text()).toContain("drwxr-xr-x");
  });

  it("cats files and refuses directories and binaries", async () => {
    expect((await run("cat intro.txt")).text()).toContain("pragmatic");
    expect((await run("cat skills.json")).text()).toContain('"Programming"');
    expect((await run("cat projects")).text()).toContain("Is a directory");
    expect((await run("cat cv.pdf")).text()).toContain("binary file");
    expect((await run("cat secrets.env")).text()).toContain("No such file or directory");
  });

  it("runs executables by path", async () => {
    const { text } = await run("./contact.sh", { answers: [null] });
    expect(text()).toContain(profile.email ? "cancelled" : "github.com/willi-bit");
  });

  it("chains with && and stops on failure", async () => {
    const shell = createIO();
    expect(await execute("cd nowhere && cd projects", shell.io)).toBe(1);
    expect(shell.state.cwd).toBe(HOME);
    await execute("cd nowhere ; cd projects", shell.io);
    expect(shell.state.cwd).toBe(`${HOME}/projects`);
  });

  it("opens pages, profiles, and documents", async () => {
    expect((await run("open about")).state.navigated).toBe("/about/");
    expect((await run("open github")).state.opened[0]).toContain("github.com");
    expect((await run("open cv.pdf")).state.opened[0]).toBe("/cv.pdf");
    expect((await run("open nowhere")).status).toBe(1);
  });

  it("switches themes", async () => {
    const shell = createIO();
    await execute("theme dracula", shell.io);
    expect(shell.state.theme.id).toBe("dracula");
    expect(await execute("theme nope", shell.io)).toBe(1);
  });

  it.runIf(profile.email)("composes mail and validates the answers", async () => {
    const { state, status } = await run("mail", {
      answers: ["Ada", "not-an-email", "ada@example.com", "Hello!", "y"],
    });
    expect(status).toBe(0);
    expect(state.opened[0]).toMatch(new RegExp(`^mailto:${profile.email}\\?subject=`));
    expect(decodeURIComponent(state.opened[0] ?? "")).toContain("ada@example.com");
  });

  it.runIf(profile.email)("can cancel mail", async () => {
    const { state, status } = await run("mail", { answers: ["Ada", null] });
    expect(status).toBe(130);
    expect(state.opened).toEqual([]);
  });

  it.skipIf(profile.email)("hides email and mail when no address is configured", async () => {
    expect((await run("mail")).status).toBe(127);
    expect(getCompletions("mai", { cwd: HOME })).toEqual([]);
    const contact = (await run("contact")).text();
    expect(contact).not.toContain("email");
    expect(contact).toContain("linkedin.com/in/willi-bittorf");
  });

  it("suggests the closest command for typos", async () => {
    const { text, status } = await run("projcts");
    expect(status).toBe(127);
    expect(text()).toContain("command not found");
    expect(text()).toContain("projects");
  });

  it("expands variables in echo", async () => {
    expect((await run("echo $USER")).text()).toContain("visitor");
  });

  it("keeps the easter eggs", async () => {
    expect((await run("sudo rm -rf /")).text()).toContain("sudoers");
    expect((await run("man willi")).text()).toContain("WILLI(1)");
  });

  it("marks clear and exit", async () => {
    expect((await run("clear")).state.cleared).toBe(true);
    expect((await run("exit")).state.exited).toBe(true);
  });
});

/* ------------------------------------------------------------------
   Layout: output must fit the terminal at every width
------------------------------------------------------------------ */
describe("layout", () => {
  const commands = ["help", "neofetch", "about", "experience", "projects", "skills", "education", "cv", "contact", "theme", "tree", "ls -la", "man willi"];

  for (const cols of [40, 64, 100, 140]) {
    it(`keeps every line within ${cols} columns`, async () => {
      const overflowing: string[] = [];
      for (const command of commands) {
        const shell = createIO({ cols });
        await execute(command, shell.io);
        for (const line of shell.output.join("\n").split("\n")) {
          if (width(line) > cols) {
            overflowing.push(`${command}: "${line}" (${width(line)})`);
          }
        }
      }
      expect(overflowing).toEqual([]);
    });
  }

  it("wraps words and hard-splits long ones", () => {
    expect(wrap("the quick brown fox", 9)).toEqual(["the quick", "brown fox"]);
    expect(wrap("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"]);
  });

  it("flows chips into lines", () => {
    expect(flow(["aa", "bb", "cc"], 5)).toEqual(["aa bb", "cc"]);
  });

  it("draws boxes of the requested width", () => {
    const lines = box(["hello"], { width: 20, title: "t", border: "#ffffff" });
    expect(lines.map(width)).toEqual([20, 20, 20]);
    expect(strip(lines[0] ?? "")).toMatch(/^╭─ t ─+╮$/);
  });

  it("strips colors and hyperlinks when measuring", () => {
    const p = palette(defaultTheme);
    expect(width(p.cmd("help"))).toBe(4);
    expect(strip(p.url("https://example.com", "x"))).toBe("x");
  });

  it("renders the portrait when one is available", () => {
    const withPortrait = { ...context(120), assets: { portrait: [[["#ff0000", null]] as [string | null, string | null][]] } };
    expect(neofetch(withPortrait).join("\n")).toContain("▀");
  });

  it("hashes deterministically", () => {
    expect(shortHash("adesso")).toBe(shortHash("adesso"));
    expect(shortHash("adesso")).toMatch(/^[0-9a-f]{7}$/);
  });
});

/* ------------------------------------------------------------------
   Line editor
------------------------------------------------------------------ */
describe("line editor", () => {
  it("decodes keys, escape sequences, and pastes", () => {
    expect(decodeInput("ab\x1b[D\r")).toEqual([
      { type: "text", text: "ab" },
      { type: "left" },
      { type: "enter" },
    ]);
    expect(decodeInput("\x1b[1;5C\x7f\x03")).toEqual([{ type: "wordRight" }, { type: "backspace" }, { type: "interrupt" }]);
    expect(decodeInput("line\r\n")).toEqual([{ type: "text", text: "line" }, { type: "enter" }]);
  });

  it("drops wide glyphs and swallows unknown sequences", () => {
    expect(decodeInput("a😀b\x1b[99~")).toEqual([{ type: "text", text: "ab" }]);
    expect(decodeInput("äöü")).toEqual([{ type: "text", text: "äöü" }]);
  });

  it("edits around the cursor", () => {
    let state = createState("hello world");
    state = edit(state, { type: "wordLeft" });
    expect(state.cursor).toBe(6);
    state = edit(state, { type: "killWord" });
    expect(valueOf(state)).toBe("world");
    state = edit(state, { type: "end" });
    state = edit(state, { type: "text", text: "!" });
    expect(valueOf(state)).toBe("world!");
    state = edit(state, { type: "home" });
    state = edit(state, { type: "delete" });
    expect(valueOf(state)).toBe("orld!");
    state = edit(state, { type: "killEnd" });
    expect(valueOf(state)).toBe("");
  });

  it("places the cursor on wrapped lines", () => {
    // Prompt 3 + 5 chars at 10 cols: end at col 8, cursor at offset 2 → col 5.
    expect(placeCursor(3, 5, 2, 10)).toEqual({ row: 0, sequence: "\x1b[6G" });
    // 3 + 12 = 15 → row 1; cursor at offset 1 → row 0 col 4: one row up.
    expect(placeCursor(3, 12, 1, 10)).toEqual({ row: 0, sequence: "\x1b[1A\x1b[5G" });
    // Exactly filling the row leaves xterm in pending wrap: step to the next row.
    expect(placeCursor(3, 7, 7, 10)).toEqual({ row: 1, sequence: "\r\n" });
  });
});

/* ------------------------------------------------------------------
   Themes
------------------------------------------------------------------ */
describe("themes", () => {
  it("finds themes by id or label", () => {
    expect(findTheme("rose-pine")?.id).toBe("rose-pine");
    expect(findTheme("Tokyo Night")?.id).toBe("tokyo-night");
    expect(findTheme("nope")).toBeUndefined();
  });

  it("generates a stylesheet entry per theme", () => {
    const css = themeStylesheet();
    for (const theme of themes) {
      expect(css).toContain(`[data-theme="${theme.id}"]`);
    }
    expect(css).toContain(":root");
  });
});
