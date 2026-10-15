import {
  education,
  experience,
  profile,
  projects,
  skillGroups,
} from "../../data/site";
import { formatPeriod } from "../dates";

/**
 * A tiny read-only filesystem: the single source of truth for `ls`, `cd`,
 * `cat`, `tree`, `open`, and path completion.
 */
export type VNode =
  | { kind: "dir"; name: string; children: VNode[] }
  /** Plain text; `cat` prints it (light markdown styling is applied). */
  | { kind: "file"; name: string; read: () => string }
  /** Executable: running it (`./contact.sh`) runs `command`. */
  | { kind: "exec"; name: string; command: string }
  /** Document with its own page: `cat` refuses, `open` navigates to `href`. */
  | { kind: "doc"; name: string; href: string; command: string };

export const HOME = "/home/visitor";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function projectReadme(slug: string): string {
  const project = projects.find((item) => item.slug === slug);
  if (!project) {
    return "";
  }
  return [
    `# ${project.title}`,
    "",
    project.summary,
    "",
    project.description,
    "",
    "## Stack",
    "",
    ...project.technologies.map((technology) => `- ${technology}`),
    "",
    "## Links",
    "",
    ...project.links.map((link) => `- ${link.label}: ${link.href}`),
  ].join("\n");
}

export const experienceFiles = experience.map((item) => ({
  item,
  name: `${item.start}-${slugify(item.company)}.md`,
}));

const homeDirectory: VNode = {
  kind: "dir",
  name: "visitor",
  children: [
    {
      kind: "file",
      name: ".plan",
      read: () => {
        const current = experience.find((item) => !item.end);
        const degree = education[0];
        return [
          current ? `Currently: ${current.role} at ${current.company}.` : "",
          degree
            ? `Recently: finished my ${degree.degree} at ${degree.institution}.`
            : "",
          "Always: turning day-to-day problems into software that works reliably.",
        ]
          .filter(Boolean)
          .join("\n");
      },
    },
    {
      kind: "file",
      name: "README.md",
      read: () =>
        [
          "# Welcome",
          "",
          "This site is a terminal. Type `help` to list commands, or click",
          "anything underlined. Tab completes, ↑/↓ walks your history, and",
          "→ accepts the grey suggestion.",
          "",
          "Prefer plain pages? Every section also exists as a regular web",
          "page — try `open about`.",
        ].join("\n"),
    },
    {
      kind: "file",
      name: "about.md",
      read: () => [`# ${profile.name}`, "", ...profile.about.flatMap((p) => [p, ""])].join("\n").trimEnd(),
    },
    { kind: "exec", name: "contact.sh", command: profile.email ? "mail" : "contact" },
    {
      kind: "doc",
      name: "cv.pdf",
      href: "/cv/",
      command: "cv",
    },
    {
      kind: "dir",
      name: "experience",
      children: experienceFiles.map(({ item, name }) => ({
        kind: "file" as const,
        name,
        read: () =>
          [
            `# ${item.role}`,
            "",
            `${item.company} · ${formatPeriod(item.start, item.end)}`,
            "",
            item.summary,
            "",
            ...item.highlights.map((highlight) => `- ${highlight}`),
          ].join("\n"),
      })),
    },
    { kind: "file", name: "intro.txt", read: () => profile.introduction },
    {
      kind: "dir",
      name: "projects",
      children: projects.map((project) => ({
        kind: "dir" as const,
        name: project.slug,
        children: [
          {
            kind: "file" as const,
            name: "README.md",
            read: () => projectReadme(project.slug),
          },
        ],
      })),
    },
    {
      kind: "file",
      name: "skills.json",
      read: () =>
        JSON.stringify(
          Object.fromEntries(skillGroups.map((group) => [group.title, group.items])),
          null,
          2,
        ),
    },
  ],
};

export const root: VNode = {
  kind: "dir",
  name: "",
  children: [{ kind: "dir", name: "home", children: [homeDirectory] }],
};

/** Normalizes `path` against `cwd`, expanding `~`. Returns an absolute path. */
export function resolvePath(cwd: string, path: string): string {
  let target = path.trim();
  if (target === "~" || target.startsWith("~/")) {
    target = HOME + target.slice(1);
  }
  const absolute = target.startsWith("/") ? target : `${cwd}/${target}`;
  const parts: string[] = [];
  for (const part of absolute.split("/")) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return `/${parts.join("/")}`;
}

export function lookup(path: string): VNode | undefined {
  let node: VNode | undefined = root;
  for (const part of path.split("/").filter(Boolean)) {
    if (node?.kind !== "dir") {
      return undefined;
    }
    const lower: string = part.toLowerCase();
    node = node.children.find((child) => child.name.toLowerCase() === lower);
  }
  return node;
}

/** `/home/visitor/projects` → `~/projects` */
export function displayPath(path: string): string {
  if (path === HOME) {
    return "~";
  }
  return path.startsWith(`${HOME}/`) ? `~${path.slice(HOME.length)}` : path;
}

export function isHidden(node: VNode): boolean {
  return node.name.startsWith(".");
}

/** Size in bytes, as `ls -l` would report it. */
export function nodeSize(node: VNode): number {
  switch (node.kind) {
    case "dir":
    case "doc":
      return 4096;
    case "exec":
      return 512;
    case "file":
      return new TextEncoder().encode(node.read()).length;
  }
}

/** Name with its `ls -F` suffix: `projects/`, `contact.sh*`. */
export function decoratedName(node: VNode): string {
  if (node.kind === "dir") {
    return `${node.name}/`;
  }
  return node.kind === "exec" ? `${node.name}*` : node.name;
}

/**
 * Path completion: `cat ex` → `experience/`, `cd projects/we` →
 * `projects/webterm-portfolio/`. Returns full replacement tokens.
 */
export function completePath(
  cwd: string,
  token: string,
  accept: (node: VNode) => boolean = () => true,
): string[] {
  const slash = token.lastIndexOf("/");
  const directoryPart = slash >= 0 ? token.slice(0, slash + 1) : "";
  const namePart = (slash >= 0 ? token.slice(slash + 1) : token).toLowerCase();
  const directory = lookup(resolvePath(cwd, directoryPart || "."));
  if (directory?.kind !== "dir") {
    return [];
  }
  return directory.children
    .filter((child) => child.name.toLowerCase().startsWith(namePart))
    .filter((child) => namePart.startsWith(".") || !isHidden(child))
    .filter((child) => child.kind === "dir" || accept(child))
    .map((child) => `${directoryPart}${child.name}${child.kind === "dir" ? "/" : ""}`);
}
