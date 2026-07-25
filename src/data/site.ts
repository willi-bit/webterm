export interface SocialLink {
  label: string;
  href: string;
}

export interface SkillGroup {
  title: string;
  items: string[];
}

export interface ExperienceItem {
  company: string;
  role: string;
  period: string;
  summary: string;
  highlights: string[];
}

export interface Project {
  slug: string;
  title: string;
  summary: string;
  description: string;
  technologies: string[];
  links: SocialLink[];
}

export const profile = {
  name: "Your Name",
  role: "Go and React developer",
  location: "Europe",
  introduction:
    "I build dependable software and enjoy understanding systems from the terminal upward.",
  about: [
    "This prototype keeps personal content separate from presentation. Replace these paragraphs in src/data/site.ts without touching page or terminal logic.",
    "Describe how you work, what you care about, and the kinds of problems you want to solve.",
  ],
  email: "you@example.com",
  socials: [
    { label: "GitHub", href: "https://github.com/your-handle" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/your-handle" },
  ] satisfies SocialLink[],
};

export const skillGroups: SkillGroup[] = [
  {
    title: "Backend",
    items: ["Go", "HTTP APIs", "Concurrency", "PostgreSQL"],
  },
  {
    title: "Frontend",
    items: ["React", "TypeScript", "Accessibility", "Web performance"],
  },
  {
    title: "Tools",
    items: ["Linux", "Git", "Containers", "Cloudflare"],
  },
];

export const experience: ExperienceItem[] = [
  {
    company: "Your company",
    role: "Your role",
    period: "20XX — Present",
    summary:
      "Replace this entry with a concise explanation of your responsibility and impact.",
    highlights: [
      "Describe a measurable technical or product outcome.",
      "Describe how you collaborated or improved the way the team worked.",
    ],
  },
];

export const projects: Project[] = [
  {
    slug: "webterm-portfolio",
    title: "Webterm Portfolio",
    summary:
      "A terminal-inspired personal site that remains usable as a conventional portfolio.",
    description:
      "Built as a static Astro site with an interactive React command interface and prepared for Cloudflare Workers Static Assets.",
    technologies: ["Astro", "React", "TypeScript", "Cloudflare Workers"],
    links: [],
  },
  {
    slug: "your-project",
    title: "Your project",
    summary: "Replace this example with one of your strongest projects.",
    description:
      "Explain the problem, your decisions, and the result. The project route and terminal command are generated from this shared record.",
    technologies: ["Go", "React"],
    links: [],
  },
];

export const navigation = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about/", command: "about" },
  { label: "Experience", href: "/experience/", command: "experience" },
  { label: "Projects", href: "/projects/", command: "projects" },
  { label: "CV", href: "/cv/", command: "cv" },
  { label: "Contact", href: "/contact/", command: "contact" },
] as const;
