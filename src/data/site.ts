export interface SocialLink {
  label: string;
  href: string;
}

export interface SkillGroup {
  title: string;
  items: string[];
}

export interface EducationItem {
  institution: string;
  degree: string;
  period: string;
  location: string;
  details: string[];
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
  name: "Willi Bittorf",
  role: "Full-Stack Software Engineer",
  location: "Leipzig, Germany",
  introduction:
    "I build pragmatic full-stack software for real business processes, with a focus on internal applications, developer tooling, and AI-assisted workflows.",
  about: [
    "My work spans product logic, data models, APIs, performance, and user-facing interfaces. At adesso, I develop internal applications with Next.js, TypeScript, and Spring Boot, and contribute to an internal AI taskforce evaluating tools for developer productivity and business workflows.",
    "I especially enjoy turning a concrete day-to-day problem into a robust application: understanding the requirements, shaping the technical approach, implementing it incrementally, and improving it until it works reliably in daily use.",
    "Born with one hand, I learned early to solve technical and ergonomic constraints pragmatically. I automate workflows, adapt tools, and shape working methods so they function reliably.",
  ],
  email: "willi@willibit.com",
  socials: [
    { label: "GitHub", href: "https://github.com/willi-bit" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/willi-bittorf" },
  ] satisfies SocialLink[],
  languages: [
    { language: "German", proficiency: "Native" },
    { language: "English", proficiency: "C1 · professional working proficiency" },
  ],
};

export const skillGroups: SkillGroup[] = [
  {
    title: "Programming",
    items: ["Java", "TypeScript", "Go", "C"],
  },
  {
    title: "Frontend & Backend",
    items: ["Spring Boot", "JEE", "React", "Next.js", "Node.js", "REST APIs"],
  },
  {
    title: "Databases",
    items: ["PostgreSQL", "MySQL", "MongoDB", "SQL/NoSQL"],
  },
  {
    title: "Tooling",
    items: ["Git", "Docker", "Maven", "Gradle", "Linux", "Neovim"],
  },
  {
    title: "AI/ML",
    items: [
      "LLM applications",
      "RAG",
      "Prompt engineering",
      "Classical ML methods",
    ],
  },
];

export const education: EducationItem[] = [
  {
    institution: "Leipzig University",
    degree: "Bachelor of Science in Computer Science · Final grade: 2.6",
    period: "Oct 2021 — Jul 2026",
    location: "Leipzig, Germany",
    details: [
      "Parallel Processing",
      "Distributed Application Development",
      "Information Retrieval",
      "Knowledge-Based Systems",
      "Database Systems",
    ],
  },
];

export const experience: ExperienceItem[] = [
  {
    company: "adesso SE",
    role: "Working Student, Software Engineering",
    period: "Nov 2023 — Present",
    summary:
      "Developing internal applications and automation across the frontend and backend.",
    highlights: [
      "Developed an internal web shop and its product logic with Next.js, TypeScript, and Spring Boot, including LLM-powered features and internal automation.",
      "Designed a Local-First shopping cart with intelligent product search and optimized performance and user interactions.",
      "Containerized the frontend, backend, and supporting services for reproducible development and consistent runtime environments.",
      "Contributed to the internal AI taskforce by evaluating and introducing AI tools for developer productivity and internal workflows.",
    ],
  },
  {
    company: "vub | Wissen mit System",
    role: "Data Management Team Lead",
    period: "Oct 2022 — Nov 2023",
    summary:
      "Led a student data management team responsible for most internal data systems.",
    highlights: [
      "Improved scalable data pipelines and internal tools to automate recurring processes.",
      "Worked in English within an international student team and coordinated with cross-site colleagues in India to maintain data quality and reliable workflows.",
    ],
  },
  {
    company: "vub | Wissen mit System",
    role: "Working Student, Software Engineering",
    period: "Jun 2022 — Oct 2022",
    summary:
      "Developed backend functionality for the company's core enterprise knowledge management system.",
    highlights: [
      "Implemented features and resolved defects in Java, Spring Boot, and JEE.",
      "Contributed occasionally to the React frontend and worked with JBoss, EJB, JDBC, Maven, and Git.",
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
    links: [
      { label: "GitHub", href: "https://github.com/willi-bit/webterm" },
    ],
  },
  {
    slug: "microservice-architecture-visualization",
    title: "Microservice Architecture Visualization",
    summary:
      "A bachelor's thesis application for visualizing microservice architectures and communication patterns, graded 1.0.",
    description:
      "Developed an application that is used in projects at adesso. Designed and conducted a two-phase study to evaluate the application, guide its practical development, and improve usability.",
    technologies: ["Java", "Maven", "React"],
    links: [],
  },
];

export const navigation = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about/" },
  { label: "Experience", href: "/experience/" },
  { label: "Projects", href: "/projects/" },
  { label: "CV", href: "/cv/" },
  { label: "Contact", href: "/contact/" },
] as const;
