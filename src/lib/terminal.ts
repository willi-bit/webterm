import {
  profile,
  projects,
  skillGroups,
} from "../data/site";

export type OutputTone = "default" | "muted" | "accent" | "success" | "error";

export interface TextOutputItem {
  kind: "text";
  text: string;
  href?: string;
  external?: boolean;
  tone?: OutputTone;
}

/**
 * The command engine is framework-independent: it returns plain data and the
 * React layer decides how to render each kind. "text" items render as lines,
 * everything else renders as a real component inside the terminal viewport.
 */
export type OutputItem =
  | TextOutputItem
  | { kind: "ls" }
  | { kind: "projects" }
  | { kind: "experience" }
  | { kind: "contact" }
  | { kind: "cv" };

export interface CommandResult {
  output: OutputItem[];
  clear?: boolean;
  navigateTo?: string;
}

export interface ParsedCommand {
  name: string;
  args: string[];
}

/** Commands typed out automatically when the terminal first loads. */
export const bootCommands = ["whoami", "cat intro.txt", "help"] as const;

const commandNames = [
  "about",
  "cat",
  "clear",
  "contact",
  "cv",
  "echo",
  "experience",
  "help",
  "ls",
  "open",
  "project",
  "projects",
  "pwd",
  "resume",
  "skills",
  "sudo",
  "whoami",
] as const;

const knownRoutes: Record<string, string> = {
  home: "/",
  about: "/about/",
  experience: "/experience/",
  projects: "/projects/",
  cv: "/cv/",
  resume: "/cv/",
  contact: "/contact/",
};

/**
 * One small virtual filesystem, shared by `ls`, `cat`, and tab completion —
 * a single source of truth so the three can never drift apart.
 */
export type FsEntry =
  | { name: string; kind: "file"; read: () => string[] }
  | { name: string; kind: "dir" | "exec" | "doc" };

export const fileSystem: FsEntry[] = [
  { name: "about.md", kind: "file", read: () => [...profile.about] },
  { name: "contact.sh", kind: "exec" },
  { name: "cv.pdf", kind: "doc" },
  { name: "experience/", kind: "dir" },
  { name: "intro.txt", kind: "file", read: () => [profile.introduction] },
  { name: "projects/", kind: "dir" },
  {
    name: "README.md",
    kind: "file",
    read: () => [
      "This site is a terminal. Type help to list commands.",
      "Tab completes, ↑/↓ recalls history, chips below work too.",
    ],
  },
];

/** Candidates for the argument slot of commands that take one. */
const argumentCandidates: Record<string, string[]> = {
  cat: fileSystem.map((entry) => entry.name),
  open: Object.keys(knownRoutes),
  project: projects.map((project) => project.slug),
};

export function parseCommand(raw: string): ParsedCommand {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (const character of raw.trim()) {
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
    } else if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += character;
    }
  }

  if (current) {
    tokens.push(current);
  }

  const [name = "", ...args] = tokens;
  return { name: name.toLowerCase(), args };
}

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
 * Context-aware completion: the first token completes command names, later
 * tokens complete that command's arguments (files for cat, pages for open,
 * slugs for project). Matching is case-insensitive; results keep their
 * canonical spelling (e.g. README.md).
 */
export function getCompletions(input: string): string[] {
  const trimmed = input.trimStart();
  if (!trimmed) {
    return [];
  }

  const tokens = trimmed.split(/\s+/);
  const atFirstToken = tokens.length === 1 && !/\s$/.test(trimmed);

  if (atFirstToken) {
    const prefix = (tokens[0] ?? "").toLowerCase();
    return commandNames.filter((command) => command.startsWith(prefix));
  }

  const [command = ""] = tokens;
  const candidates = argumentCandidates[command.toLowerCase()] ?? [];
  const token = /\s$/.test(trimmed) ? "" : (tokens.at(-1) ?? "");
  const prefix = token.toLowerCase();
  return candidates.filter((candidate) =>
    candidate.toLowerCase().startsWith(prefix),
  );
}

export function commonPrefix(values: string[]): string {
  const [first] = values;
  if (first === undefined) {
    return "";
  }

  let prefix = first;
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }
  return prefix;
}

function text(
  value: string,
  tone: OutputTone = "default",
  extra?: { href?: string; external?: boolean },
): TextOutputItem {
  return { kind: "text", text: value, tone, ...extra };
}

export function executeCommand(raw: string): CommandResult {
  const { name, args } = parseCommand(raw);

  if (!name) {
    return { output: [] };
  }

  switch (name) {
    case "help":
      return {
        output: [
          text("Available commands:", "accent"),
          text("  about | whoami     A short introduction", "muted"),
          text("  experience         Work history as a timeline", "muted"),
          text("  projects           Selected projects", "muted"),
          text("  project <slug>     Inspect one project", "muted"),
          text("  skills             Technical skills", "muted"),
          text("  cv | resume        Preview and download the CV", "muted"),
          text("  contact            Send a message", "muted"),
          text("  ls | cat <file>    Browse the virtual filesystem", "muted"),
          text("  open <page>        Open a portfolio page", "muted"),
          text("  clear              Clear the terminal", "muted"),
          text("Try: about, experience, projects, cv, contact — or tap a chip below.", "accent"),
        ],
      };

    case "whoami":
      return { output: [text(`${profile.name}, ${profile.role}`)] };

    case "about":
      return {
        output: [
          text(`${profile.name} — ${profile.role}`),
          text(profile.introduction, "muted"),
          text("Read the full profile", "default", { href: "/about/" }),
        ],
      };

    case "cat": {
      const query = args[0];
      if (!query) {
        return { output: [text("Usage: cat <file>. Try: cat intro.txt", "muted")] };
      }

      // `cat projects` should hit projects/ just like `cat projects/` would.
      const wanted = query.replace(/\/+$/, "").toLowerCase();
      const entry = fileSystem.find(
        (item) => item.name.replace(/\/+$/, "").toLowerCase() === wanted,
      );

      if (!entry) {
        return { output: [text(`cat: ${query}: no such file or directory`, "error")] };
      }

      switch (entry.kind) {
        case "dir":
          return { output: [text(`cat: ${query}: Is a directory`, "error")] };
        case "doc":
          return {
            output: [
              text(`cat: ${entry.name}: binary file — use \`cv\` to preview it`, "error"),
            ],
          };
        case "exec":
          return {
            output: [
              text(`cat: ${entry.name}: permission denied — use \`contact\` instead`, "error"),
            ],
          };
        case "file":
          return { output: entry.read().map((line) => text(line)) };
      }
    }

    case "projects":
      return { output: [{ kind: "projects" }] };

    case "project": {
      const slug = args[0]?.toLowerCase();
      if (!slug) {
        return {
          output: [text("Usage: project <slug>. Run projects to list slugs.", "muted")],
        };
      }

      const project = projects.find((item) => item.slug === slug);
      if (!project) {
        return {
          output: [text(`Project not found: ${slug}. Run projects to list slugs.`, "error")],
        };
      }

      return {
        output: [
          text(project.title, "accent"),
          text(project.description),
          text(`Stack: ${project.technologies.join(", ")}`, "muted"),
          text("Open project page", "default", { href: `/projects/${project.slug}/` }),
          ...project.links.map((link) =>
            text(link.label, "default", { href: link.href, external: true }),
          ),
        ],
      };
    }

    case "experience":
      return { output: [{ kind: "experience" }] };

    case "skills":
      return {
        output: skillGroups.map((group) =>
          text(`${group.title.padEnd(10)} ${group.items.join(", ")}`),
        ),
      };

    case "contact":
      return { output: [{ kind: "contact" }] };

    case "cv":
    case "resume":
      return { output: [{ kind: "cv" }] };

    case "open": {
      const target = args[0]?.toLowerCase();
      if (!target || !knownRoutes[target]) {
        return {
          output: [
            text(`Usage: open <${Object.keys(knownRoutes).join("|")}>`, "muted"),
          ],
        };
      }

      return {
        output: [text(`Opening ${target}…`, "success", { href: knownRoutes[target] })],
        navigateTo: knownRoutes[target],
      };
    }

    case "ls":
      return { output: [{ kind: "ls" }] };

    case "pwd":
      return { output: [text("/home/visitor/portfolio")] };

    case "echo":
      return { output: [text(args.join(" "))] };

    case "sudo":
      return {
        output: [
          text("visitor is not in the sudoers file. This incident will be reported.", "error"),
        ],
      };

    case "clear":
      return { output: [], clear: true };

    default:
      return {
        output: [
          text(`Command not found: ${name}. Type help to list available commands.`, "error"),
        ],
      };
  }
}
