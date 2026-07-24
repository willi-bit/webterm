import {
  experience,
  profile,
  projects,
  skillGroups,
} from "../data/site";

export interface OutputItem {
  text: string;
  href?: string;
  external?: boolean;
}

export interface CommandResult {
  output: OutputItem[];
  clear?: boolean;
  navigateTo?: string;
}

export interface ParsedCommand {
  name: string;
  args: string[];
}

const commandNames = [
  "about",
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

export function getCompletions(input: string): string[] {
  const normalized = input.trimStart().toLowerCase();
  if (normalized.includes(" ")) {
    return [];
  }

  return commandNames.filter((command) => command.startsWith(normalized));
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
          { text: "Available commands:" },
          { text: "about | whoami        A short introduction" },
          { text: "projects              List selected projects" },
          { text: "project <slug>        Inspect one project" },
          { text: "experience            Show work experience" },
          { text: "skills                Show technical skills" },
          { text: "cv | resume            Open the CV page" },
          { text: "contact                Show contact details" },
          { text: "open <page>            Open a portfolio page" },
          { text: "ls | pwd | echo        Familiar shell-like utilities" },
          { text: "clear                  Clear terminal history" },
          { text: "Tip: use ↑/↓ for history and Tab for completion." },
        ],
      };

    case "about":
    case "whoami":
      return {
        output: [
          { text: `${profile.name} — ${profile.role}` },
          { text: profile.introduction },
          { text: "Read the full profile", href: "/about/" },
        ],
      };

    case "projects":
      return {
        output: [
          { text: "Selected projects:" },
          ...projects.map((project) => ({
            text: `${project.slug.padEnd(20)} ${project.summary}`,
            href: `/projects/${project.slug}/`,
          })),
        ],
      };

    case "project": {
      const slug = args[0]?.toLowerCase();
      if (!slug) {
        return {
          output: [{ text: "Usage: project <slug>. Run projects to list slugs." }],
        };
      }

      const project = projects.find((item) => item.slug === slug);
      if (!project) {
        return {
          output: [{ text: `Project not found: ${slug}. Run projects to list slugs.` }],
        };
      }

      return {
        output: [
          { text: project.title },
          { text: project.description },
          { text: `Stack: ${project.technologies.join(", ")}` },
          { text: "Open project page", href: `/projects/${project.slug}/` },
          ...project.links.map((link) => ({
            text: link.label,
            href: link.href,
            external: true,
          })),
        ],
      };
    }

    case "experience":
      return {
        output: [
          ...experience.flatMap((item) => [
            { text: `${item.role} — ${item.company} (${item.period})` },
            { text: item.summary },
          ]),
          { text: "View full experience", href: "/experience/" },
        ],
      };

    case "skills":
      return {
        output: skillGroups.map((group) => ({
          text: `${group.title}: ${group.items.join(", ")}`,
        })),
      };

    case "contact":
      return {
        output: [
          { text: `Email: ${profile.email}`, href: `mailto:${profile.email}` },
          ...profile.socials.map((link) => ({
            text: link.label,
            href: link.href,
            external: true,
          })),
          { text: "Open contact page", href: "/contact/" },
        ],
      };

    case "cv":
    case "resume":
      return {
        output: [{ text: "Opening CV…", href: "/cv/" }],
        navigateTo: "/cv/",
      };

    case "open": {
      const target = args[0]?.toLowerCase();
      if (!target || !knownRoutes[target]) {
        return {
          output: [
            {
              text: `Usage: open <${Object.keys(knownRoutes).join("|")}>`,
            },
          ],
        };
      }

      return {
        output: [{ text: `Opening ${target}…`, href: knownRoutes[target] }],
        navigateTo: knownRoutes[target],
      };
    }

    case "ls":
      return {
        output: [
          {
            text: "about/  experience/  projects/  cv/  contact/",
          },
        ],
      };

    case "pwd":
      return { output: [{ text: "/home/visitor/portfolio" }] };

    case "echo":
      return { output: [{ text: args.join(" ") }] };

    case "clear":
      return { output: [], clear: true };

    default:
      return {
        output: [
          {
            text: `Command not found: ${name}. Type help to list available commands.`,
          },
        ],
      };
  }
}
