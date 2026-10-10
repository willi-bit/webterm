import { profile, projects } from "../../data/site";
import { findTheme, themes } from "../themes";
import { flow, padEnd, padStart, truncate } from "./ansi";
import {
  about,
  contactCard,
  cvCard,
  educationView,
  experienceLog,
  helpScreen,
  lines,
  message,
  neofetch,
  projectDetail,
  projectList,
  renderFile,
  skills,
  themeList,
} from "./render";
import type { Command, CompletionContext, RenderContext, ShellIO } from "./types";
import {
  HOME,
  completePath,
  decoratedName,
  displayPath,
  isHidden,
  lookup,
  nodeSize,
  resolvePath,
  type VNode,
} from "./vfs";

/* ------------------------------------------------------------------
   Parsing
------------------------------------------------------------------ */
export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Splits a line into tokens, honoring single and double quotes. */
export function tokenize(raw: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let started = false;

  for (const character of raw) {
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      started = true;
    } else if (/\s/.test(character)) {
      if (started) {
        tokens.push(current);
        current = "";
        started = false;
      }
    } else {
      current += character;
      started = true;
    }
  }
  if (started) {
    tokens.push(current);
  }
  return tokens;
}

export function parseCommand(raw: string): ParsedCommand {
  const [name = "", ...args] = tokenize(raw.trim());
  return { name: name.toLowerCase(), args };
}

export interface ChainSegment {
  command: string;
  /** How this segment joins the previous one: `&&` runs only on success. */
  join: "&&" | ";" | null;
}

/** `a && b ; c` → three segments (quotes respected). */
export function splitChain(raw: string): ChainSegment[] {
  const segments: ChainSegment[] = [];
  let current = "";
  let join: ChainSegment["join"] = null;
  let quote: string | null = null;
  const push = (next: ChainSegment["join"]) => {
    if (current.trim()) {
      segments.push({ command: current.trim(), join: segments.length ? join : null });
    }
    current = "";
    join = next;
  };
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index]!;
    if (quote) {
      if (character === quote) {
        quote = null;
      }
      current += character;
    } else if (character === "'" || character === '"') {
      quote = character;
      current += character;
    } else if (character === ";") {
      push(";");
    } else if (character === "&" && raw[index + 1] === "&") {
      push("&&");
      index += 1;
    } else {
      current += character;
    }
  }
  push(null);
  return segments;
}

/** Expands `$VAR` and `${VAR}` from the shell environment. */
export function expandVariables(raw: string, env: Readonly<Record<string, string>>): string {
  return raw.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_match, name: string) => env[name] ?? "");
}

/* ------------------------------------------------------------------
   Routes for `open`
------------------------------------------------------------------ */
export const pages: Record<string, string> = {
  home: "/",
  about: "/about/",
  experience: "/experience/",
  projects: "/projects/",
  cv: "/cv/",
  resume: "/cv/",
  contact: "/contact/",
};

const externalTargets: Record<string, string> = Object.fromEntries(
  profile.socials.map((social) => [social.label.toLowerCase(), social.href]),
);

/* ------------------------------------------------------------------
   Commands
------------------------------------------------------------------ */
function pathArgument(accept?: (node: VNode) => boolean) {
  return (args: string[], context: CompletionContext) =>
    completePath(context.cwd, args.at(-1) ?? "", accept);
}

function lsName(node: VNode, path: string, maxWidth = Number.POSITIVE_INFINITY) {
  return (context: RenderContext) => {
    const { p } = context;
    const name = truncate(decoratedName(node), Math.max(4, maxWidth));
    const target = path ? `${path.replace(/\/?$/, "/")}${node.name}` : node.name;
    switch (node.kind) {
      case "dir":
        return p.cmd(`ls ${target}`, p.bold(p.blue(name)));
      case "exec":
        return p.cmd(`./${target}`, p.bold(p.green(name)));
      case "doc":
        return p.cmd(`open ${target}`, p.yellow(name));
      default:
        return p.cmd(`cat ${target}`, isHidden(node) ? p.faint(name) : p.text(name));
    }
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return String(bytes);
  }
  return `${(bytes / 1024).toFixed(1)}K`;
}

function ls(io: ShellIO, args: string[]): number {
  const flags = args.filter((arg) => arg.startsWith("-")).join("");
  const showAll = flags.includes("a");
  const long = flags.includes("l");
  const targets = args.filter((arg) => !arg.startsWith("-"));
  const target = targets[0] ?? ".";
  const path = resolvePath(io.cwd, target);
  const node = lookup(path);

  if (!node) {
    io.print(message("error", `ls: cannot access '${target}': No such file or directory`));
    return 2;
  }

  const children = node.kind === "dir" ? node.children : [node];
  const visible = children.filter((child) => showAll || !isHidden(child));
  const shownPath = targets[0] && node.kind === "dir" ? targets[0] : "";

  if (long) {
    io.print(
      lines((context) => {
        const { p } = context;
        const rows = visible.map((child) => {
          const mode =
            child.kind === "dir"
              ? "drwxr-xr-x"
              : child.kind === "exec"
                ? "-rwxr-xr-x"
                : "-rw-r--r--";
          return [
            p.faint(mode),
            p.muted("willi"),
            p.muted(padStart(formatSize(nodeSize(child)), 6)),
            lsName(child, shownPath)(context),
          ].join("  ");
        });
        return [`${p.faint(`total ${visible.length}`)}`, ...rows];
      }),
    );
    return 0;
  }

  io.print(
    lines((context) => {
      const names = visible.map((child) => lsName(child, shownPath)(context));
      const cellWidth = Math.max(...visible.map((child) => decoratedName(child).length)) + 2;
      const perRow = Math.max(1, Math.floor((context.cols - 2) / cellWidth));
      const rows: string[] = [];
      for (let index = 0; index < names.length; index += perRow) {
        rows.push(
          names
            .slice(index, index + perRow)
            .map((name, column) => {
              const child = visible[index + column]!;
              return name + " ".repeat(cellWidth - decoratedName(child).length);
            })
            .join("")
            .trimEnd(),
        );
      }
      return rows;
    }),
  );
  return 0;
}

function tree(io: ShellIO, args: string[]): number {
  const target = args.find((arg) => !arg.startsWith("-")) ?? ".";
  const node = lookup(resolvePath(io.cwd, target));
  if (node?.kind !== "dir") {
    io.print(message("error", `tree: ${target}: not a directory`));
    return 2;
  }

  io.print(
    lines((context) => {
      const { p } = context;
      const output: string[] = [p.bold(p.blue(target === "." ? displayPath(io.cwd) : target))];
      let directories = 0;
      let files = 0;
      const walk = (directory: Extract<VNode, { kind: "dir" }>, prefix: string, base: string) => {
        const children = directory.children.filter((child) => !isHidden(child));
        children.forEach((child, index) => {
          const last = index === children.length - 1;
          const childPath = base ? `${base}/${child.name}` : child.name;
          const branch = prefix + (last ? "└── " : "├── ");
          output.push(`${p.faint(branch)}${lsName(child, base, context.cols - 2 - branch.length)(context)}`);
          if (child.kind === "dir") {
            directories += 1;
            walk(child, prefix + (last ? "    " : "│   "), childPath);
          } else {
            files += 1;
          }
        });
      };
      walk(node, "", target === "." ? "" : target.replace(/\/$/, ""));
      output.push("", p.faint(`${directories} directories, ${files} files`));
      return output;
    }),
  );
  return 0;
}

function cat(io: ShellIO, args: string[]): number {
  if (args.length === 0) {
    io.print(message("muted", "usage: cat <file>   try: cat README.md"));
    return 1;
  }
  let status = 0;
  for (const target of args) {
    const node = lookup(resolvePath(io.cwd, target));
    if (!node) {
      io.print(message("error", `cat: ${target}: No such file or directory`));
      status = 1;
    } else if (node.kind === "dir") {
      io.print(message("error", `cat: ${target}: Is a directory`));
      status = 1;
    } else if (node.kind === "doc") {
      io.print(message("error", `cat: ${target}: binary file — try \`open ${node.name}\` or \`cv\``));
      status = 1;
    } else if (node.kind === "exec") {
      io.print(
        lines((context) => [
          context.p.faint("#!/bin/wsh"),
          context.p.faint("# run it with ./contact.sh"),
          context.p.text(node.command),
        ]),
      );
    } else {
      io.print(renderFile(node.name, node.read()));
    }
  }
  return status;
}

function cd(io: ShellIO, args: string[]): number {
  const target = args[0] ?? "~";
  const path = target === "-" ? io.previousCwd : resolvePath(io.cwd, target);
  const node = lookup(path);
  if (!node) {
    io.print(message("error", `cd: no such file or directory: ${target}`));
    return 1;
  }
  if (node.kind !== "dir") {
    io.print(message("error", `cd: not a directory: ${target}`));
    return 1;
  }
  io.setCwd(path);
  return 0;
}

function open(io: ShellIO, args: string[]): number {
  const target = args[0];
  if (!target) {
    io.print(message("muted", `usage: open <${Object.keys(pages).join("|")}|github|linkedin|file|url>`));
    return 1;
  }
  const lower = target.toLowerCase();
  if (/^https?:\/\//.test(target)) {
    io.openUrl(target);
    return 0;
  }
  if (externalTargets[lower]) {
    io.print(message("ok", `↗ opening ${externalTargets[lower]}`));
    io.openUrl(externalTargets[lower]!);
    return 0;
  }
  const page = pages[lower];
  if (page) {
    io.print(message("ok", `→ opening ${page}`));
    io.navigate(page);
    return 0;
  }
  const project = projects.find((item) => item.slug === lower);
  if (project) {
    io.navigate(`/projects/${project.slug}/`);
    return 0;
  }
  const node = lookup(resolvePath(io.cwd, target));
  if (node?.kind === "doc") {
    io.print(message("ok", `→ opening ${node.href}`));
    io.openUrl(node.href);
    return 0;
  }
  if (node?.kind === "file" || node?.kind === "exec") {
    return cat(io, [target]);
  }
  if (node?.kind === "dir") {
    return ls(io, [target]);
  }
  io.print(message("error", `open: ${target}: nothing to open`));
  return 1;
}

async function mail(io: ShellIO, to: string): Promise<number> {
  io.print(
    lines((context) => [
      "",
      `${context.p.faint("┌")}  ${context.p.heading("mail")} ${context.p.muted(`to ${to}`)}`,
      `${context.p.faint("│")}  ${context.p.faint("Ctrl+C cancels at any point")}`,
      context.p.faint("│"),
    ]),
  );

  const ask = async (label: string, validate: (value: string) => string | null): Promise<string | null> => {
    const value = await io.readLine({
      header: (context, error) => {
        const { p } = context;
        return [
          ` ${error ? p.yellow("▲") : p.accent("◆")}  ${p.bold(label)}${error ? `  ${p.yellow(error)}` : ""}`,
        ];
      },
      prompt: (context) => ` ${context.p.faint("│")}  `,
      validate: (answer) => validate(answer.trim()),
      final: (answer, context) => {
        const { p } = context;
        return [` ${p.faint("◇")}  ${p.muted(label)}`, ` ${p.faint("│")}  ${p.text(answer.trim())}`, ` ${p.faint("│")}`];
      },
    });
    return value === null ? null : value.trim();
  };

  const cancelled = () => {
    io.print(lines((context) => [`${context.p.faint("└")}  ${context.p.yellow("cancelled — nothing was sent")}`]));
    return 130;
  };

  const name = await ask("your name", (value) => (value ? null : "please tell me who you are"));
  if (name === null) {
    return cancelled();
  }
  const email = await ask("your email", (value) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "that doesn't look like an email address",
  );
  if (email === null) {
    return cancelled();
  }
  const body = await ask("message", (value) => (value ? null : "a message would be nice"));
  if (body === null) {
    return cancelled();
  }
  const confirm = await io.readLine({
    header: (context) => [` ${context.p.accent("◆")}  ${context.p.bold("open it in your mail client?")} ${context.p.faint("(Y/n)")}`],
    prompt: (context) => ` ${context.p.faint("│")}  `,
    final: (answer, context) => [
      ` ${context.p.faint("◇")}  ${context.p.muted("open it in your mail client?")}`,
      ` ${context.p.faint("│")}  ${context.p.text(answer || "yes")}`,
    ],
  });
  if (confirm === null || /^n/i.test(confirm.trim())) {
    return cancelled();
  }

  const subject = encodeURIComponent(`Portfolio contact — ${name}`);
  const text = encodeURIComponent(`${body}\n\n— ${name} (${email})`);
  io.print(
    lines((context) => [
      `${context.p.faint("└")}  ${context.p.green("✓ handed over to your mail client")}`,
      `   ${context.p.faint("nothing happened? write to")} ${context.p.url(`mailto:${to}`, to)}`,
    ]),
  );
  io.openUrl(`mailto:${to}?subject=${subject}&body=${text}`);
  return 0;
}

async function wget(io: ShellIO, args: string[]): Promise<number> {
  const target = args.find((arg) => !arg.startsWith("-")) ?? "cv.pdf";
  const node = lookup(resolvePath(io.cwd, target.replace(/^https?:\/\/[^/]+\//, "")));
  if (node?.kind !== "doc") {
    io.print(message("error", `wget: ${target}: only cv.pdf is downloadable here`));
    return 8;
  }

  const started = new Date();
  const stamp = (date: Date) => date.toISOString().slice(0, 19).replace("T", " ");
  const origin = globalThis.location?.origin ?? "https://willibit.com";
  const host = origin.replace(/^https?:\/\//, "");
  io.print(
    lines((context) => [
      context.p.muted(`--${stamp(started)}--  ${origin}${node.href}`),
      context.p.muted(`Resolving ${host}... connected.`),
      context.p.muted("HTTP request sent, awaiting response... ") + context.p.green("200 OK"),
    ]),
  );

  let response: Response;
  try {
    response = await io.fetch(node.href);
    if (!response.ok || !response.body) {
      throw new Error(String(response.status));
    }
  } catch {
    io.print(message("error", "wget: connection failed — try the download button in `cv` instead"));
    return 4;
  }

  const total = Number(response.headers.get("content-length")) || node.size;
  io.print(
    lines((context) => [
      context.p.muted(`Length: ${total} (${Math.round(total / 1024)}K) [application/pdf]`),
      context.p.muted(`Saving to: ‘${node.name}’`),
      "",
    ]),
  );

  const line = io.live();
  const bar = (received: number, cols: number, done: boolean) => {
    const percent = Math.min(100, Math.round((received / total) * 100));
    const barWidth = Math.max(10, Math.min(40, cols - 40));
    const filled = Math.round((percent / 100) * barWidth);
    const arrow = done ? "=" : ">";
    const track = `${"=".repeat(Math.max(0, filled - 1))}${filled > 0 ? arrow : ""}${" ".repeat(barWidth - filled)}`;
    return ` ${padEnd(node.name, 10)} ${padStart(String(percent), 3)}%[${track}] ${padStart(`${(received / 1024).toFixed(1)}K`, 8)}`;
  };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || io.signal.aborted) {
      break;
    }
    chunks.push(value);
    received += value.length;
    line.update(bar(received, io.cols, false));
    await io.sleep(40);
  }
  if (io.signal.aborted) {
    void reader.cancel();
    line.done(() => []);
    return 130;
  }
  const seconds = Math.max(0.1, (Date.now() - started.getTime()) / 1000);
  line.done((context) => [context.p.accent(bar(received, context.cols, true)) + context.p.faint(`  in ${seconds.toFixed(1)}s`)]);

  io.download(new Blob(chunks as BlobPart[], { type: "application/pdf" }), node.name);
  const finished = stamp(new Date());
  io.print(
    lines((context) => [
      "",
      context.p.muted(`${finished} (${Math.round(received / 1024 / seconds)} KB/s) - `) +
        context.p.green(`‘${node.name}’ saved [${received}/${total}]`),
    ]),
  );
  return 0;
}

const portfolioCommands: Command[] = [
  {
    name: "about",
    group: "portfolio",
    summary: "who I am, in a few paragraphs",
    run: (_, io) => io.print(about),
  },
  {
    name: "experience",
    aliases: ["work", "exp"],
    group: "portfolio",
    summary: "work history, as a git log",
    run: (_, io) => io.print(experienceLog),
  },
  {
    name: "projects",
    group: "portfolio",
    summary: "selected projects",
    run: (_, io) => io.print(projectList),
  },
  {
    name: "project",
    group: "portfolio",
    usage: "project <slug>",
    summary: "one project in detail",
    complete: (args) =>
      projects
        .map((project) => project.slug)
        .filter((slug) => slug.startsWith((args.at(-1) ?? "").toLowerCase())),
    run: (args, io) => {
      const slug = args[0]?.toLowerCase();
      const project = projects.find((item) => item.slug === slug);
      if (!slug || !project) {
        io.print(
          message(
            slug ? "error" : "muted",
            slug
              ? `project: ${slug}: not found — run projects to list them`
              : `usage: project <${projects.map((item) => item.slug).join("|")}>`,
          ),
        );
        return 1;
      }
      io.print(projectDetail(project));
      return 0;
    },
  },
  {
    name: "skills",
    group: "portfolio",
    summary: "languages, frameworks, and tools",
    run: (_, io) => io.print(skills),
  },
  {
    name: "education",
    aliases: ["edu"],
    group: "portfolio",
    summary: "degree, coursework, and languages",
    run: (_, io) => io.print(educationView),
  },
  {
    name: "cv",
    aliases: ["resume"],
    group: "portfolio",
    summary: "résumé — preview and download",
    run: (_, io) => io.print(cvCard),
  },
  {
    name: "contact",
    group: "portfolio",
    summary: profile.email ? "email, socials, and a message form" : "where to find me",
    run: (_, io) => {
      // Freeze the clock: re-rendered output shouldn't change its time.
      const now = new Date();
      io.print((context) => contactCard({ ...context, now }));
    },
  },
  // Only offered while an address is configured in site.ts.
  ...(profile.email
    ? [
        {
          name: "mail",
          group: "portfolio",
          summary: "write me a message from the terminal",
          run: (_, io) => mail(io, profile.email!),
        } satisfies Command,
      ]
    : []),
];

const systemCommands: Command[] = [
  {
    name: "help",
    group: "system",
    usage: "help [command]",
    summary: "list commands",
    complete: (args) => completeCommandName(args.at(-1) ?? ""),
    run: (args, io) => {
      if (args[0]) {
        return man([args[0]], io);
      }
      io.print(
        helpScreen(
          portfolioCommands.map((command) => ({
            usage: command.usage ?? command.name,
            summary: command.summary,
            command: command.usage ? `${command.name} ${projects[0]?.slug ?? ""}` : command.name,
          })),
          systemCommands.filter((command) => command.name !== "help").map((command) => command.name),
        ),
      );
      return 0;
    },
  },
  {
    name: "neofetch",
    aliases: ["fetch", "fastfetch"],
    group: "system",
    summary: "the welcome screen",
    run: (_, io) => io.print(neofetch),
  },
  {
    name: "ls",
    group: "system",
    usage: "ls [-la] [path]",
    summary: "list files",
    complete: pathArgument((node) => node.kind === "dir"),
    run: (args, io) => ls(io, args),
  },
  {
    name: "cd",
    group: "system",
    usage: "cd [path]",
    summary: "change directory (cd - goes back)",
    complete: pathArgument(() => false),
    run: (args, io) => cd(io, args),
  },
  {
    name: "cat",
    group: "system",
    usage: "cat <file>",
    summary: "print a file",
    complete: pathArgument((node) => node.kind !== "dir"),
    run: (args, io) => cat(io, args),
  },
  {
    name: "tree",
    group: "system",
    usage: "tree [path]",
    summary: "show the directory tree",
    complete: pathArgument(() => false),
    run: (args, io) => tree(io, args),
  },
  {
    name: "pwd",
    group: "system",
    summary: "print the working directory",
    run: (_, io) => io.print(message("text", io.cwd)),
  },
  {
    name: "open",
    group: "system",
    usage: "open <page|file|url>",
    summary: "open a page, file, or link",
    complete: (args, context) => {
      const token = (args.at(-1) ?? "").toLowerCase();
      const named = [...Object.keys(pages), ...Object.keys(externalTargets)].filter((name) =>
        name.startsWith(token),
      );
      return [...named, ...completePath(context.cwd, args.at(-1) ?? "")];
    },
    run: (args, io) => open(io, args),
  },
  {
    name: "wget",
    aliases: ["curl", "download"],
    group: "system",
    usage: "wget cv.pdf",
    summary: "download the CV, the old-fashioned way",
    complete: pathArgument((node) => node.kind === "doc"),
    run: (args, io) => wget(io, args),
  },
  {
    name: "theme",
    group: "system",
    usage: "theme [name]",
    summary: "switch the color theme",
    complete: (args) =>
      themes.map((theme) => theme.id).filter((id) => id.startsWith((args.at(-1) ?? "").toLowerCase())),
    run: (args, io) => {
      if (!args[0]) {
        io.print(themeList(io.theme));
        return 0;
      }
      const theme =
        args[0] === "next"
          ? themes[(themes.indexOf(io.theme) + 1) % themes.length]
          : findTheme(args[0]);
      if (!theme) {
        io.print(message("error", `theme: unknown theme '${args[0]}' — run theme to list them`));
        return 1;
      }
      io.setTheme(theme);
      io.print(message("ok", `✓ theme set to ${theme.label}`));
      return 0;
    },
  },
  {
    name: "crt",
    group: "system",
    usage: "crt [on|off]",
    summary: "toggle CRT scanlines",
    complete: (args) => ["on", "off"].filter((value) => value.startsWith(args.at(-1) ?? "")),
    run: (args, io) => {
      const on = args[0] ? args[0] === "on" : !io.crt;
      io.setCrt(on);
      io.print(message("ok", `✓ crt ${on ? "on — welcome to 1983" : "off"}`));
      return 0;
    },
  },
  {
    name: "history",
    group: "system",
    summary: "show command history",
    run: (_, io) =>
      io.print(
        lines((context) =>
          io.history.map(
            (entry, index) => `${context.p.faint(padStart(String(index + 1), 4))}  ${context.p.cmd(entry, entry)}`,
          ),
        ),
      ),
  },
  {
    name: "clear",
    group: "system",
    summary: "clear the screen (or press Ctrl+L)",
    run: (_, io) => io.clear(),
  },
  {
    name: "copy",
    group: "system",
    usage: "copy <text>",
    summary: "copy text to the clipboard",
    run: async (args, io) => {
      const text = args.join(" ") || profile.email;
      if (!text) {
        io.print(message("muted", "usage: copy <text>"));
        return 1;
      }
      const copied = await io.copy(text);
      io.print(message(copied ? "ok" : "error", copied ? `✓ copied ${text}` : "copy: clipboard unavailable"));
      return copied ? 0 : 1;
    },
  },
  {
    name: "echo",
    group: "system",
    usage: "echo [text]",
    summary: "print text ($USER, $THEME… expand)",
    run: (args, io) => io.print(message("text", args.join(" "))),
  },
  {
    name: "env",
    group: "system",
    summary: "print environment variables",
    run: (_, io) =>
      io.print(
        lines((context) =>
          Object.entries(io.env).map(([key, value]) => `${context.p.accent2(key)}${context.p.faint("=")}${context.p.text(value)}`),
        ),
      ),
  },
  {
    name: "date",
    group: "system",
    summary: "print the date in Leipzig",
    run: (_, io) =>
      io.print(
        message(
          "text",
          new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
            timeZone: "Europe/Berlin",
            timeZoneName: "short",
            year: "numeric",
          }).format(new Date()),
        ),
      ),
  },
  {
    name: "whoami",
    group: "system",
    summary: "print the current user",
    run: (_, io) =>
      io.print(
        lines((context) => [
          context.p.text("visitor"),
          `${context.p.faint("looking for the person behind this site? try")} ${context.p.cmd("about")}`,
        ]),
      ),
  },
  {
    name: "uname",
    group: "system",
    usage: "uname [-a]",
    summary: "print system information",
    run: (args, io) =>
      io.print(
        message(
          "text",
          args.includes("-a")
            ? "wsh 2.0.0 willibit xterm.js-6.0.0 #1 SMP PREEMPT_DYNAMIC browser x86_64 GNU/Portfolio"
            : "wsh",
        ),
      ),
  },
  {
    name: "man",
    group: "system",
    usage: "man <command>",
    summary: "manual for a command",
    complete: (args) => [...completeCommandName(args.at(-1) ?? ""), ...("willi".startsWith(args.at(-1) ?? "") ? ["willi"] : [])],
    run: (args, io) => man(args, io),
  },
  {
    name: "exit",
    aliases: ["logout"],
    group: "system",
    summary: "end the session",
    run: (_, io) => io.exit(),
  },
];

const hiddenCommands: Command[] = [
  {
    name: "sudo",
    group: "hidden",
    summary: "",
    run: (_, io) => {
      io.print(
        lines((context) => [
          context.p.red("visitor is not in the sudoers file. This incident will be reported."),
          context.p.faint("(to /dev/null)"),
        ]),
      );
      return 1;
    },
  },
  {
    name: "rm",
    group: "hidden",
    summary: "",
    run: (_, io) => {
      io.print(message("error", "rm: cannot remove: read-only file system. Nice try, though."));
      return 1;
    },
  },
  {
    name: "vim",
    aliases: ["nvim", "vi", "nano", "emacs"],
    group: "hidden",
    summary: "",
    run: (_, io) => {
      io.print(
        lines((context) => [
          context.p.text("You'd never find :q in here anyway."),
          context.p.faint("(Willi does run Neovim, though.)"),
        ]),
      );
    },
  },
  {
    name: "hello",
    aliases: ["hi", "hey"],
    group: "hidden",
    summary: "",
    run: (_, io) =>
      io.print(
        lines((context) => [
          `${context.p.text("Hey there!")} ${context.p.muted("Want to say hi for real?")} ${context.p.cmd(profile.email ? "mail" : "contact")}`,
        ]),
      ),
  },
];

export const commands: Command[] = [...portfolioCommands, ...systemCommands, ...hiddenCommands];

export function findCommand(name: string): Command | undefined {
  const lower = name.toLowerCase();
  return commands.find(
    (command) => command.name === lower || command.aliases?.includes(lower),
  );
}

/** Command names offered by completion — hidden easter eggs stay hidden. */
export const completableNames = commands
  .filter((command) => command.group !== "hidden")
  .flatMap((command) => [command.name, ...(command.aliases ?? [])])
  .sort();

function completeCommandName(prefix: string): string[] {
  const lower = prefix.toLowerCase();
  return completableNames.filter((name) => name.startsWith(lower));
}

function man(args: string[], io: ShellIO): number {
  const name = args[0]?.toLowerCase();
  if (!name) {
    io.print(message("muted", "What manual page do you want? For example, try 'man willi'."));
    return 1;
  }

  if (name === "willi") {
    io.print(
      lines((context) => {
        const { p } = context;
        const width = Math.min(80, context.cols - 2);
        const pad = context.cols < 60 ? "  " : "       ";
        const section = (title: string, body: string[]) => [p.bold(p.accent(title)), ...body.map((line) => `${pad}${line}`), ""];
        const title = "Portfolio Manual";
        const gap = Math.max(1, Math.floor((width - 2 * "WILLI(1)".length - title.length) / 2));
        return [
          `${p.bold("WILLI(1)")}${" ".repeat(gap)}${p.muted(title)}${" ".repeat(gap)}${p.bold("WILLI(1)")}`,
          "",
          ...section("NAME", wrapMan(`willi — ${profile.role.toLowerCase()}`, width - pad.length)),
          ...section(
            "SYNOPSIS",
            flow([p.bold("willi"), `[${p.underline("--hire")}]`, `[${p.underline("--contact")}]`, `[${p.underline("--coffee")}]`], width - pad.length),
          ),
          ...section("DESCRIPTION", wrapMan(profile.introduction, width - pad.length)),
          ...section("OPTIONS", [
            ...flow([p.bold("--hire"), `see ${p.cmd("cv")} and ${p.cmd("experience")}`], width - pad.length, "     "),
            ...flow(
              [p.bold("--contact"), `see ${p.cmd("contact")}${profile.email ? "," : ""}`, ...(profile.email ? [`or just ${p.cmd("mail")}`] : [])],
              width - pad.length,
              "  ",
            ),
            ...flow([p.bold("--coffee"), "always accepted"], width - pad.length, "   "),
          ]),
          ...section("SEE ALSO", [`${p.cmd("about", "about(1)")}, ${p.cmd("projects", "projects(1)")}, ${p.cmd("skills", "skills(1)")}`]),
        ];
      }),
    );
    return 0;
  }

  const command = findCommand(name);
  if (!command || command.group === "hidden") {
    io.print(message("error", `No manual entry for ${name}`));
    return 16;
  }

  io.print(
    lines((context) => {
      const { p } = context;
      return [
        p.bold(p.accent("NAME")),
        `       ${command.name} — ${command.summary}`,
        "",
        p.bold(p.accent("SYNOPSIS")),
        `       ${command.usage ?? command.name}`,
        ...(command.aliases?.length
          ? ["", p.bold(p.accent("ALIASES")), `       ${command.aliases.join(", ")}`]
          : []),
        ...(command.details ? ["", p.bold(p.accent("DESCRIPTION")), ...command.details.map((line) => `       ${line}`)] : []),
      ];
    }),
  );
  return 0;
}

function wrapMan(text: string, size: number): string[] {
  const words = text.split(/\s+/);
  const output: string[] = [];
  let line = "";
  for (const word of words) {
    if (line && line.length + word.length + 1 > size) {
      output.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) {
    output.push(line);
  }
  return output;
}

/* ------------------------------------------------------------------
   Completion, suggestions, and highlighting
------------------------------------------------------------------ */
/**
 * Splits the input into the token being completed and everything before it,
 * so callers can swap the token for a completion without touching the rest.
 */
export function completionToken(input: string): { before: string; token: string } {
  const match = /\S+$/.exec(input);
  if (!match) {
    return { before: input, token: "" };
  }
  return { before: input.slice(0, match.index), token: match[0] };
}

/**
 * Context-aware completion: the first token completes command names (and
 * paths, for `./contact.sh`), later tokens complete that command's arguments.
 */
export function getCompletions(input: string, context: CompletionContext): string[] {
  const segment = splitChainTail(input);
  const trimmed = segment.trimStart();
  if (!trimmed) {
    return [];
  }
  const tokens = trimmed.split(/\s+/);
  const atFirstToken = tokens.length === 1 && !/\s$/.test(trimmed);
  const token = /\s$/.test(trimmed) ? "" : (tokens.at(-1) ?? "");

  if (atFirstToken) {
    if (token.includes("/") || token.startsWith(".") || token.startsWith("~")) {
      return completePath(context.cwd, token, (node) => node.kind === "exec");
    }
    return completeCommandName(token);
  }

  const command = findCommand(tokens[0] ?? "");
  if (!command?.complete) {
    return [];
  }
  const args = [...tokens.slice(1, /\s$/.test(trimmed) ? undefined : -1), token];
  return command.complete(args, context);
}

/** The part of the input after the last `&&` or `;`. */
function splitChainTail(input: string): string {
  const match = /(?:&&|;)([^;&]*)$/.exec(input);
  return match ? (match[1] ?? "") : input;
}

export function commonPrefix(values: string[]): string {
  const [first] = values;
  if (first === undefined) {
    return "";
  }
  let prefix = first;
  for (const value of values.slice(1)) {
    while (!value.toLowerCase().startsWith(prefix.toLowerCase())) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

/**
 * Fish-style autosuggestion: the most recent matching history entry, or
 * else the single completion for the current token. Returns only the part
 * after what was typed.
 */
export function suggest(input: string, history: readonly string[], context: CompletionContext): string {
  if (!input.trim()) {
    return "";
  }
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index]!;
    if (entry.length > input.length && entry.startsWith(input)) {
      return entry.slice(input.length);
    }
  }
  const candidates = getCompletions(input, context);
  const { token } = completionToken(input);
  const [first] = candidates;
  if (candidates.length >= 1 && first && token && first.toLowerCase().startsWith(token.toLowerCase())) {
    return first.slice(token.length);
  }
  return "";
}

export type TokenKind = "command" | "partial" | "unknown" | "path" | "flag" | "string" | "operator" | "text" | "space";

/** Classifies input for syntax highlighting (fish colors). */
export function classify(input: string, context: CompletionContext): { text: string; kind: TokenKind }[] {
  const parts: { text: string; kind: TokenKind }[] = [];
  const pattern = /(\s+)|(&&|;)|("[^"]*"?|'[^']*'?)|(\S+)/g;
  let expectCommand = true;
  for (const match of input.matchAll(pattern)) {
    const [text, space, operator, quoted, word] = match;
    if (space) {
      parts.push({ text, kind: "space" });
    } else if (operator) {
      parts.push({ text, kind: "operator" });
      expectCommand = true;
    } else if (quoted) {
      parts.push({ text, kind: "string" });
      expectCommand = false;
    } else if (word) {
      if (expectCommand) {
        const known = Boolean(findCommand(word)) || lookup(resolvePath(context.cwd, word))?.kind === "exec";
        const partial = !known && completableNames.some((name) => name.startsWith(word.toLowerCase()));
        parts.push({ text, kind: known ? "command" : partial ? "partial" : "unknown" });
        expectCommand = false;
      } else if (word.startsWith("-")) {
        parts.push({ text, kind: "flag" });
      } else if (lookup(resolvePath(context.cwd, word))) {
        parts.push({ text, kind: "path" });
      } else {
        parts.push({ text, kind: "text" });
      }
    }
  }
  return parts;
}

/** "Did you mean …?" — the closest command within edit distance 2. */
export function closestCommand(name: string): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const candidate of completableNames) {
    const distance = levenshtein(name.toLowerCase(), candidate);
    if (distance <= 2 && (!best || distance < best.distance)) {
      best = { name: candidate, distance };
    }
  }
  return best?.name;
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length]!;
}

/* ------------------------------------------------------------------
   Execution
------------------------------------------------------------------ */
export function defaultEnv(cwd: string, theme: string): Record<string, string> {
  return {
    USER: "visitor",
    HOME,
    SHELL: "/bin/wsh",
    TERM: "xterm-256color",
    PWD: cwd,
    THEME: theme,
    EDITOR: "nvim",
  };
}

/** Runs one input line (which may chain commands). Returns the exit status. */
export async function execute(raw: string, io: ShellIO): Promise<number> {
  let status = 0;
  for (const segment of splitChain(raw)) {
    if (segment.join === "&&" && status !== 0) {
      continue;
    }
    status = await executeOne(expandVariables(segment.command, io.env), io);
    if (io.signal.aborted) {
      return 130;
    }
  }
  return status;
}

async function executeOne(raw: string, io: ShellIO): Promise<number> {
  const { name, args } = parseCommand(raw);
  if (!name) {
    return 0;
  }

  // Paths: run executables, auto-cd into directories (like zsh AUTO_CD).
  if (name.includes("/") || name === ".." || name === "~") {
    const node = lookup(resolvePath(io.cwd, name));
    if (node?.kind === "exec") {
      return execute(node.command, io);
    }
    if (node?.kind === "dir") {
      return cd(io, [name]);
    }
    io.print(message("error", node ? `wsh: permission denied: ${name}` : `wsh: no such file or directory: ${name}`));
    return node ? 126 : 127;
  }

  const command = findCommand(name);
  if (!command) {
    const guess = closestCommand(name);
    io.print(
      lines((context) => [
        `${context.p.red("wsh: command not found:")} ${context.p.text(name)}`,
        guess
          ? `${context.p.faint("did you mean")} ${context.p.cmd(guess)}${context.p.faint("? or run")} ${context.p.cmd("help")}`
          : `${context.p.faint("run")} ${context.p.cmd("help")} ${context.p.faint("to see what's possible")}`,
      ]),
    );
    return 127;
  }

  const result = await command.run(args, io);
  return typeof result === "number" ? result : 0;
}

