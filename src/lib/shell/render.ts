import {
  education,
  experience,
  profile,
  projects,
  skillGroups,
  type Project,
} from "../../data/site";
import {
  formatDuration,
  formatMonth,
  formatPeriod,
  monthsBetween,
} from "../dates";
import { hexToRgb, mix, themes, type Theme } from "../themes";
import {
  badge,
  bg,
  box,
  columns,
  fg,
  flow,
  gradient,
  link,
  padEnd,
  truncate,
  width,
  wrap,
} from "./ansi";
import type { Renderable, RenderContext } from "./types";

/* ------------------------------------------------------------------
   Banner art (figlet "ANSI Shadow" and "Future", baked in)
------------------------------------------------------------------ */
const bannerLarge = [
  "██╗    ██╗██╗██╗     ██╗     ██╗    ██████╗ ██╗████████╗████████╗ ██████╗ ██████╗ ███████╗",
  "██║    ██║██║██║     ██║     ██║    ██╔══██╗██║╚══██╔══╝╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝",
  "██║ █╗ ██║██║██║     ██║     ██║    ██████╔╝██║   ██║      ██║   ██║   ██║██████╔╝█████╗",
  "██║███╗██║██║██║     ██║     ██║    ██╔══██╗██║   ██║      ██║   ██║   ██║██╔══██╗██╔══╝",
  "╚███╔███╔╝██║███████╗███████╗██║    ██████╔╝██║   ██║      ██║   ╚██████╔╝██║  ██║██║",
  " ╚══╝╚══╝ ╚═╝╚══════╝╚══════╝╚═╝    ╚═════╝ ╚═╝   ╚═╝      ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝",
];

const bannerMedium = [
  "██╗    ██╗██╗██╗     ██╗     ██╗██████╗ ██╗████████╗",
  "██║    ██║██║██║     ██║     ██║██╔══██╗██║╚══██╔══╝",
  "██║ █╗ ██║██║██║     ██║     ██║██████╔╝██║   ██║",
  "██║███╗██║██║██║     ██║     ██║██╔══██╗██║   ██║",
  "╚███╔███╔╝██║███████╗███████╗██║██████╔╝██║   ██║",
  " ╚══╝╚══╝ ╚═╝╚══════╝╚══════╝╚═╝╚═════╝ ╚═╝   ╚═╝",
];

const bannerSmall = [
  "╻ ╻╻╻  ╻  ╻   ┏┓ ╻╺┳╸╺┳╸┏━┓┏━┓┏━╸",
  "┃╻┃┃┃  ┃  ┃   ┣┻┓┃ ┃  ┃ ┃ ┃┣┳┛┣╸",
  "┗┻┛╹┗━╸┗━╸╹   ┗━┛╹ ╹  ╹ ┗━┛╹┗╸╹",
];

const bannerTiny = [
  "╻ ╻╻╻  ╻  ╻┏┓ ╻╺┳╸",
  "┃╻┃┃┃  ┃  ┃┣┻┓┃ ┃",
  "┗┻┛╹┗━╸┗━╸╹┗━┛╹ ╹",
];

/** Indent applied to every block of output so text never hugs the edge. */
const INDENT = " ";

/** Usable width for content, after the indent and a right margin. */
function contentWidth(context: RenderContext, max = 96): number {
  return Math.max(20, Math.min(max, context.cols - 2));
}

function indent(lines: string[]): string[] {
  return lines.map((line) => (line ? INDENT + line : line));
}

export function banner(context: RenderContext): string[] {
  const { cols, theme } = context;
  const art =
    cols >= 94
      ? bannerLarge
      : cols >= 56
        ? bannerMedium
        : cols >= 36
          ? bannerSmall
          : bannerTiny;
  const blocks = art[0]?.includes("█") ?? false;
  const rows = blocks && !context.customGlyphs ? art.map((line) => line.replace(/[^█ ]/g, " ")) : art;
  const span = Math.max(...rows.map((line) => [...line].length));
  // In the block fonts, solid blocks carry the gradient and the box-drawn
  // shadow sits back. The thin "Future" font is all strokes — keep it bright.
  const shade = blocks ? { match: /[^█▀▄]/, toward: theme.panel, amount: 0.45 } : undefined;
  return indent(
    rows.map((line) => gradient(line, theme.accent, theme.accent2, shade ? { span, shade } : { span })),
  );
}

/* ------------------------------------------------------------------
   neofetch — the welcome screen
------------------------------------------------------------------ */
function portraitLines(context: RenderContext): string[] {
  const source = context.assets.portrait;
  if (!source) {
    return [];
  }
  // Monochrome CRT themes get a phosphor-tinted portrait.
  const { theme } = context;
  const tint = (hex: string | null) => {
    if (!hex || !theme.crt) {
      return hex;
    }
    const [r, g, b] = hexToRgb(hex);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return mix(theme.panel, theme.text, Math.min(1, luminance * 1.15));
  };
  const rows = source.map((row) => row.map(([top, bottom]): [string | null, string | null] => [tint(top), tint(bottom)]));
  return rows.map(
    (row) =>
      row
        .map(([top, bottom]) => {
          if (!top && !bottom) {
            // Reset the background, or the space inherits the last cell's.
            return "\x1b[49m ";
          }
          if (top && bottom) {
            return `${fg(top)}${bg(bottom)}▀`;
          }
          return top ? `\x1b[49m${fg(top)}▀` : `\x1b[49m${fg(bottom!)}▄`;
        })
        .join("") + "\x1b[0m",
  );
}

function currentRole() {
  return experience.find((item) => !item.end);
}

export const neofetch: Renderable = (context) => {
  const { p, theme, now } = context;
  const role = currentRole();
  const degree = education[0];
  const tooling = skillGroups.flatMap((group) => group.items);

  const facts: [string, string][] = [
    ["name", profile.name],
    ["role", profile.role],
  ];
  if (role) {
    facts.push([
      "work",
      `${role.company} · since ${formatMonth(role.start)} · ${formatDuration(
        monthsBetween(role.start, role.end, now),
      )}`,
    ]);
  }
  facts.push(["based", profile.location]);
  if (degree) {
    facts.push(["studied", `B.Sc. Computer Science · ${degree.institution}`]);
  }
  facts.push(["stack", profile.stack.join(" · ")]);
  if (tooling.includes("Neovim")) {
    facts.push(["editor", "Neovim"]);
  }
  facts.push(["shell", "wsh 2.0 · xterm.js 6"]);
  facts.push(["theme", theme.label]);

  const portrait = portraitLines(context);
  const portraitWidth = portrait.length ? (context.assets.portrait?.[0]?.length ?? 0) : 0;
  const showPortrait = portraitWidth > 0 && context.cols >= portraitWidth + 48;
  const infoWidth = Math.max(
    20,
    Math.min(72, context.cols - 2 - (showPortrait ? portraitWidth + 3 : 0)),
  );
  const keyWidth = 9;

  const title = `${p.bold(p.accent("visitor"))}${p.faint("@")}${p.bold(p.accent2("willibit"))}`;
  const info: string[] = [title, p.faint("─".repeat(width(title)))];
  for (const [key, value] of facts) {
    const lines = wrap(value, infoWidth - keyWidth);
    lines.forEach((line, index) => {
      info.push(`${index === 0 ? p.bold(p.accent(padEnd(key, keyWidth))) : " ".repeat(keyWidth)}${p.text(line)}`);
    });
  }
  info.push("");
  const swatch = [theme.red, theme.yellow, theme.green, theme.cyan, theme.blue, theme.magenta, theme.accent, theme.accent2];
  info.push(swatch.map((hex) => `${fg(hex)}███`).join("") + "\x1b[39m");

  const body = showPortrait
    ? columns([portrait, ["", ...info]], 3)
    : info;

  return [
    "",
    ...banner(context),
    "",
    ...indent(body),
    "",
    ...welcomeHint(context),
  ];
};

export function welcomeHint(context: RenderContext): string[] {
  const { p } = context;
  const commands = ["about", "experience", "projects", "skills", "cv", "contact", "help"];
  const lines = wrap(
    "Welcome! This website is a terminal. Type a command, or click one:",
    contentWidth(context),
  ).map((line) => p.muted(line));
  return indent([
    ...lines,
    ...flow(commands.map((command) => p.cmd(command)), contentWidth(context), "  "),
  ]);
}

/* ------------------------------------------------------------------
   help
------------------------------------------------------------------ */
export interface HelpEntry {
  usage: string;
  summary: string;
  command: string;
}

export function helpScreen(
  portfolio: HelpEntry[],
  system: string[],
): Renderable {
  return (context) => {
    const { p } = context;
    const max = contentWidth(context, 88);
    const usageWidth = Math.max(...portfolio.map((entry) => entry.usage.length)) + 3;
    const stacked = max < usageWidth + 24;

    const rows = portfolio.flatMap((entry) => {
      const usage = p.cmd(entry.command, entry.usage);
      if (stacked) {
        return [`  ${usage}`, ...wrap(entry.summary, max - 4).map((line) => `    ${p.muted(line)}`)];
      }
      const summary = wrap(entry.summary, max - usageWidth - 2);
      return summary.map(
        (line, index) =>
          `  ${index === 0 ? padEnd(usage, usageWidth) : " ".repeat(usageWidth)}${p.muted(line)}`,
      );
    });

    const keys: [string, string][] = [
      ["tab", "complete"],
      ["↑ ↓", "history"],
      ["→", "accept suggestion"],
      ["^C", "cancel"],
      ["^L", "clear"],
      ["esc", "leave terminal"],
    ];

    return [
      "",
      ...indent([
        `${p.heading("wsh")} ${p.muted("the willibit shell — help")}`,
        "",
        p.bold(p.accent2("portfolio")),
        ...rows,
        "",
        p.bold(p.accent2("system")),
        ...flow(system.map((name) => p.cmd(name)), max - 2, "  ").map((line) => `  ${line}`),
        "",
        p.bold(p.accent2("keys")),
        ...flow(
          keys.map(([key, label]) => `${p.key(key)} ${p.muted(label)}`),
          max - 2,
          "   ",
        ).map((line) => `  ${line}`),
        "",
        p.faint(truncate("Anything underlined is clickable. man <command> explains one in detail.", max)),
      ]),
    ];
  };
}

/* ------------------------------------------------------------------
   about / whoami
------------------------------------------------------------------ */
export const about: Renderable = (context) => {
  const { p } = context;
  const max = contentWidth(context, 80);
  return [
    "",
    ...indent([
      ...flow([p.heading(profile.name), p.muted(profile.role)], max),
      p.faint(profile.location),
      "",
      ...wrap(profile.introduction, max).map((line) => p.text(line)),
      "",
      ...profile.about.flatMap((paragraph) => [
        ...wrap(paragraph, max).map((line) => p.muted(line)),
        "",
      ]),
      ...flow([p.faint("more:"), ...["experience", "projects", "skills", "education", "contact"].map((name) => p.cmd(name))], max, "  "),
    ]),
  ];
};

/* ------------------------------------------------------------------
   experience — a git log of a career
------------------------------------------------------------------ */
/** Deterministic fake commit hash, so the log looks like `git log`. */
export function shortHash(seed: string): string {
  let hash = 0x811c9dc5;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 7);
}

export const experienceLog: Renderable = (context) => {
  const { p, now } = context;
  const max = contentWidth(context, 88);
  const lines: string[] = [""];
  const rail = p.faint("│");

  for (const item of experience) {
    const ongoing = !item.end;
    const dot = ongoing ? p.accent("●") : p.muted("○");
    const hash = p.yellow(shortHash(`${item.company}${item.start}`));
    const decoration = ongoing
      ? ` ${p.yellow("(")}${p.bold(p.cyan("HEAD"))}${p.yellow(" -> ")}${p.bold(p.green("main"))}${p.yellow(")")}`
      : "";
    const duration = formatDuration(monthsBetween(item.start, item.end, now));
    const period = `${formatPeriod(item.start, item.end).replace("Present", "present")}`;

    const meta = `${dot} ${hash}${decoration} ${p.faint("·")} ${p.text(period)} ${p.faint(`· ${duration}`)}`;
    // Narrow screens: drop the commit hash before letting the line wrap.
    lines.push(width(meta) <= max ? meta : `${dot} ${p.text(period)} ${p.faint(`· ${duration}`)}`);
    lines.push(`${rail} ${p.bold(item.role)}`);
    lines.push(`${rail} ${p.accent2(item.company)}`);
    for (const line of wrap(item.summary, max - 2)) {
      lines.push(`${rail} ${p.muted(line)}`);
    }
    for (const highlight of item.highlights) {
      wrap(highlight, max - 6).forEach((line, lineIndex) => {
        lines.push(`${rail}   ${lineIndex === 0 ? p.accent("▸") : " "} ${p.muted(line)}`);
      });
    }
    lines.push(rail);
  }

  const degree = education[0];
  if (degree) {
    lines.push(
      ...flow(
        [
          `${p.magenta("◆")} ${p.yellow(shortHash(degree.institution))} ${p.yellow("(")}${p.bold(p.magenta("tag: b.sc."))}${p.yellow(")")}`,
          `${p.faint("·")} ${p.text(formatPeriod(degree.start, degree.end))}`,
        ],
        max,
      ),
    );
    lines.push(...wrap(degree.degree, max - 2).map((line) => `  ${p.bold(line)}`));
    lines.push(...flow([p.accent2(degree.institution), p.faint(`· final grade ${degree.grade ?? "—"}`)], max - 2).map((line) => `  ${line}`));
  }

  lines.push("");
  lines.push(...flow([p.faint("details:"), p.cmd("ls experience/"), p.url("/experience/", "experience page")], max, "  "));
  return indent(lines);
};

/* ------------------------------------------------------------------
   projects
------------------------------------------------------------------ */
function projectCard(project: Project, index: number, cardWidth: number, context: RenderContext): string[] {
  const { p, theme } = context;
  const inner = cardWidth - 4;
  const content = [
    ...wrap(project.summary, inner).map((line) => p.text(line)),
    "",
    ...flow(project.technologies.map((technology) => p.chip(technology)), inner),
    "",
    [
      p.cmd(`project ${project.slug}`, "→ details"),
      ...project.links.map((item) => p.url(item.href, `↗ ${item.label.toLowerCase()}`)),
    ].join("   "),
  ];
  return box(content, {
    width: cardWidth,
    title: `${p.faint(String(index + 1).padStart(2, "0"))} ${p.bold(p.accent(truncate(project.title, cardWidth - 10)))}`,
    footer: p.faint(truncate(project.slug, cardWidth - 8)),
    border: theme.borderStrong,
  });
}

export const projectList: Renderable = (context) => {
  const available = context.cols - 2;
  const twoUp = available >= 2 * 46 + 2;
  const cardWidth = twoUp
    ? Math.min(60, Math.floor((available - 2) / 2))
    : Math.min(72, available);

  const cards = projects.map((project, index) => projectCard(project, index, cardWidth, context));
  const lines: string[] = [""];
  if (twoUp) {
    for (let index = 0; index < cards.length; index += 2) {
      const pair = cards.slice(index, index + 2);
      const height = Math.max(...pair.map((card) => card.length));
      // Equalize heights so side-by-side cards line up.
      const even = pair.map((card) => {
        const last = card.at(-1) ?? "";
        const fillers = Array.from({ length: height - card.length }, () =>
          `${fg(context.theme.borderStrong)}│\x1b[39m${" ".repeat(cardWidth - 2)}${fg(context.theme.borderStrong)}│\x1b[39m`,
        );
        return [...card.slice(0, -1), ...fillers, last];
      });
      lines.push(...columns(even, 2));
    }
  } else {
    for (const card of cards) {
      lines.push(...card);
    }
  }
  lines.push("");
  lines.push(
    ...flow(
      [
        context.p.faint("tip:"),
        context.p.muted("click → details, or run"),
        context.p.cmd(`project ${projects[0]?.slug ?? ""}`, "project <slug>"),
      ],
      available,
    ),
  );
  return indent(lines);
};

export function projectDetail(project: Project): Renderable {
  return (context) => {
    const { p } = context;
    const max = contentWidth(context, 80);
    return [
      "",
      ...indent([
        p.heading(project.title),
        "",
        ...wrap(project.summary, max).map((line) => p.text(line)),
        "",
        ...wrap(project.description, max).map((line) => p.muted(line)),
        "",
        p.bold(p.accent2("stack")),
        ...flow(project.technologies.map((technology) => p.chip(technology)), max),
        "",
        p.bold(p.accent2("links")),
        ...project.links.map((item) => `${p.accent("↗")} ${p.url(item.href, item.href.replace(/^https?:\/\//, ""))}`),
        `${p.accent("→")} ${p.url(`/projects/${project.slug}/`, `willibit.com/projects/${project.slug}`)}`,
        "",
        `${p.faint("back:")} ${p.cmd("projects")}`,
      ]),
    ];
  };
}

/* ------------------------------------------------------------------
   skills / education
------------------------------------------------------------------ */
export const skills: Renderable = (context) => {
  const { p } = context;
  const max = contentWidth(context, 90);
  const labelWidth = Math.max(...skillGroups.map((group) => group.title.length)) + 3;
  const stacked = max < labelWidth + 30;
  const lines: string[] = [""];
  for (const group of skillGroups) {
    const chips = group.items.map((item) => p.chip(item));
    if (stacked) {
      lines.push(p.bold(p.accent(group.title)));
      lines.push(...flow(chips, max));
      lines.push("");
    } else {
      flow(chips, max - labelWidth).forEach((line, index) => {
        lines.push(`${index === 0 ? p.bold(p.accent(padEnd(group.title, labelWidth))) : " ".repeat(labelWidth)}${line}`);
      });
      lines.push("");
    }
  }
  lines.push(`${p.faint("as json:")} ${p.cmd("cat skills.json")}`);
  return indent(lines);
};

export const educationView: Renderable = (context) => {
  const { p } = context;
  const max = contentWidth(context, 84);
  const lines: string[] = [""];
  for (const item of education) {
    wrap(item.degree, max - 2).forEach((line, index) => {
      lines.push(`${index === 0 ? p.magenta("◆") : " "} ${p.bold(line)}`);
    });
    lines.push(...flow([p.accent2(item.institution), p.faint(`· ${item.location}`)], max - 2).map((line) => `  ${line}`));
    lines.push(
      ...flow([p.text(formatPeriod(item.start, item.end)), ...(item.grade ? [p.faint(`· final grade ${item.grade}`)] : [])], max - 2).map(
        (line) => `  ${line}`,
      ),
    );
    lines.push("");
    lines.push(`  ${p.faint("selected coursework")}`);
    lines.push(...flow(item.details.map((detail) => p.chip(detail)), max - 2).map((line) => `  ${line}`));
    lines.push("");
  }
  lines.push(p.bold(p.accent2("languages")));
  for (const language of profile.languages) {
    wrap(language.proficiency, max - 11).forEach((line, index) => {
      lines.push(`  ${index === 0 ? p.text(padEnd(language.language, 9)) : " ".repeat(9)}${p.muted(line)}`);
    });
  }
  return indent(lines);
};

/* ------------------------------------------------------------------
   cv / contact
------------------------------------------------------------------ */
function button(context: RenderContext, uri: string, label: string, primary = false): string {
  const { theme } = context;
  return link(
    uri,
    primary
      ? badge(` ${label} `, theme.accent, theme.onAccent)
      : badge(` ${label} `, theme.raised, theme.text),
  );
}

export const cvCard: Renderable = (context) => {
  const { p, theme, now } = context;
  const cardWidth = Math.min(72, context.cols - 2);
  const inner = cardWidth - 4;
  const periodWidth = 22;
  const compact = inner < periodWidth + 24;

  const row = (period: string, title: string, place: string) => {
    if (compact) {
      return [
        p.faint(period),
        ...wrap(title, inner).map((line) => p.text(line)),
        ...wrap(place, inner).map((line) => p.muted(line)),
      ];
    }
    const text = [
      ...wrap(title, inner - periodWidth).map((line) => p.text(line)),
      ...wrap(place, inner - periodWidth).map((line) => p.muted(line)),
    ];
    return text.map((line, index) => `${index === 0 ? p.faint(padEnd(period, periodWidth)) : " ".repeat(periodWidth)}${line}`);
  };

  const content = [
    p.bold(profile.name),
    ...wrap(`${profile.role} · ${profile.location}`, inner).map((line) => p.muted(line)),
    "",
    p.accent2("experience"),
    ...experience.flatMap((item) => row(formatPeriod(item.start, item.end), item.role, item.company)),
    "",
    p.accent2("education"),
    ...education.flatMap((item) => row(formatPeriod(item.start, item.end), "B.Sc. Computer Science", item.institution)),
    "",
    p.accent2("skills"),
    ...wrap(skillGroups.map((group) => group.title).join(" · "), inner).map((line) => p.muted(line)),
  ];

  return [
    "",
    ...indent([
      ...box(content, {
        width: cardWidth,
        title: p.bold(p.accent("cv.pdf")),
        meta: p.faint("149 KB · PDF"),
        footer: p.faint(`updated ${now.getFullYear()}`),
        border: theme.borderStrong,
      }),
      "",
      ...flow(
        [
          button(context, "dl:/cv.pdf", "↓ download", true),
          button(context, "/cv.pdf", "open pdf"),
          button(context, "/cv/", "cv page"),
        ],
        cardWidth,
        "  ",
      ),
      "",
      `${p.faint("or the classic way:")} ${p.cmd("wget cv.pdf")}`,
    ]),
  ];
};

function localTime(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  }).format(now);
}

export const contactCard: Renderable = (context) => {
  const { p, now } = context;
  const labelWidth = 10;
  const rows: [string, string][] = [
    ...(profile.email ? [["email", p.url(`mailto:${profile.email}`, profile.email)] as [string, string]] : []),
    ...profile.socials.map(
      (social) =>
        [social.label.toLowerCase(), p.url(social.href, social.href.replace(/^https?:\/\/(www\.)?/, ""))] as [string, string],
    ),
    ["location", p.text(profile.location)],
    ["time", p.text(`${localTime(now)} in Leipzig`)],
  ];
  const max = contentWidth(context, 80);
  return [
    "",
    ...indent([
      p.heading("contact"),
      "",
      ...rows.map(([label, value]) =>
        max >= labelWidth + width(value) ? `${p.bold(p.accent(padEnd(label, labelWidth)))}${value}` : `${p.bold(p.accent(label))}\n  ${value}`,
      ).flatMap((row) => row.split("\n")),
      ...(profile.email
        ? ["", ...flow([p.muted("Write me a message right here:"), p.cmd("mail"), p.faint("·"), p.cmd(`copy ${profile.email}`, "copy email")], max)]
        : []),
    ]),
  ];
};

/* ------------------------------------------------------------------
   theme
------------------------------------------------------------------ */
export function themeList(current: Theme): Renderable {
  return (context) => {
    const { p } = context;
    const labelWidth = Math.max(...themes.map((theme) => theme.label.length)) + 3;
    return [
      "",
      ...indent([
        p.heading("themes"),
        "",
        ...themes.map((theme) => {
          const marker = theme.id === current.id ? p.accent("●") : p.faint("○");
          const swatch = [theme.panel, theme.accent, theme.accent2, theme.red, theme.yellow, theme.blue, theme.magenta]
            .map((hex) => `${fg(hex)}██`)
            .join("");
          const name = p.cmd(`theme ${theme.id}`, theme.label);
          return `${marker} ${name}${" ".repeat(labelWidth - theme.label.length)}${swatch}\x1b[39m`;
        }),
        "",
        ...wrap("click one, or: theme <name> · crt toggles scanlines", contentWidth(context)).map((line) => p.faint(line)),
      ]),
    ];
  };
}

/* ------------------------------------------------------------------
   Markdown-ish file rendering for `cat`
------------------------------------------------------------------ */
function inlineMarkdown(text: string, context: RenderContext): string {
  const { p } = context;
  return text
    .replace(/`([^`]+)`/g, (_, code: string) => p.yellow(code))
    .replace(/(https?:\/\/\S+)/g, (url: string) => p.url(url, url));
}

export function renderFile(name: string, content: string): Renderable {
  return (context) => {
    const { p } = context;
    const max = contentWidth(context, 84);

    if (name.endsWith(".json")) {
      return indent(
        content.split("\n").map((line) =>
          line
            .replace(/"([^"]+)":/g, (_, key: string) => `${p.accent2(`"${key}"`)}:`)
            .replace(/: "([^"]*)"/g, (_, value: string) => `: ${p.yellow(`"${value}"`)}`)
            .replace(/^(\s*)"([^"]*)"(,?)$/g, (_, space: string, value: string, comma: string) => `${space}${p.yellow(`"${value}"`)}${comma}`),
        ),
      );
    }

    const lines: string[] = [];
    for (const raw of content.split("\n")) {
      if (raw.startsWith("# ")) {
        lines.push(p.heading(raw.slice(2)));
      } else if (raw.startsWith("## ")) {
        lines.push(p.bold(p.accent2(raw.slice(3))));
      } else if (raw.startsWith("- ")) {
        wrap(raw.slice(2), max - 4).forEach((line, index) => {
          lines.push(`  ${index === 0 ? p.accent("▸") : " "} ${inlineMarkdown(line, context)}`);
        });
      } else if (!raw.trim()) {
        lines.push("");
      } else {
        lines.push(...wrap(raw, max).map((line) => inlineMarkdown(p.text(line), context)));
      }
    }
    return ["", ...indent(lines)];
  };
}

/* ------------------------------------------------------------------
   Generic one-liners
------------------------------------------------------------------ */
export function message(
  tone: "text" | "muted" | "faint" | "error" | "warn" | "ok",
  text: string,
): Renderable {
  return (context) => {
    const { p } = context;
    const style = {
      text: p.text,
      muted: p.muted,
      faint: p.faint,
      error: p.red,
      warn: p.yellow,
      ok: p.green,
    }[tone];
    return wrap(text, context.cols - 2).map((line) => INDENT + style(line));
  };
}

export function lines(render: (context: RenderContext) => string[]): Renderable {
  return (context) => indent(render(context));
}
