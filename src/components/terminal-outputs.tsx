import { type CSSProperties, type FormEvent, useState } from "react";
import {
  experience,
  profile,
  projects,
  skillGroups,
} from "../data/site";

interface OutputProps {
  style?: CSSProperties;
}

const lsEntries = [
  { name: "about.md", type: "file" },
  { name: "contact.sh", type: "exec" },
  { name: "cv.pdf", type: "doc" },
  { name: "experience/", type: "dir" },
  { name: "intro.txt", type: "file" },
  { name: "projects/", type: "dir" },
  { name: "README.md", type: "file" },
] as const;

export function LsOutput({ style }: OutputProps) {
  return (
    <p className="terminal__rich to-ls" style={style}>
      {lsEntries.map((entry) => (
        <span key={entry.name} className={`to-ls__item to-ls__item--${entry.type}`}>
          {entry.name}
        </span>
      ))}
    </p>
  );
}

export function ProjectsOutput({ style }: OutputProps) {
  return (
    <div className="terminal__rich to-projects" style={style}>
      {projects.map((project) => (
        <article className="to-card" key={project.slug}>
          <a className="to-card__title" href={`/projects/${project.slug}/`}>
            {project.title}
          </a>
          <p className="to-card__summary">{project.summary}</p>
          <ul className="to-tags" aria-label={`${project.title} technologies`}>
            {project.technologies.map((technology) => (
              <li key={technology}>{technology}</li>
            ))}
          </ul>
          <p className="to-card__links">
            <a href={`/projects/${project.slug}/`}>details →</a>
            {project.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                {link.label} ↗
              </a>
            ))}
          </p>
        </article>
      ))}
    </div>
  );
}

export function ExperienceOutput({ style }: OutputProps) {
  return (
    <ol className="terminal__rich to-timeline" style={style}>
      {experience.map((item) => (
        <li className="to-timeline__item" key={`${item.company}-${item.period}`}>
          <p className="to-timeline__period">{item.period}</p>
          <p className="to-timeline__role">
            {item.role} <span>— {item.company}</span>
          </p>
          <p className="to-timeline__summary">{item.summary}</p>
          <ul className="to-timeline__highlights">
            {item.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </li>
      ))}
      <li className="to-timeline__item to-timeline__item--link">
        <a href="/experience/">Full experience →</a>
      </li>
    </ol>
  );
}

export function ContactOutput({ style }: OutputProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const subject = encodeURIComponent(`Portfolio contact — ${name}`);
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    window.location.assign(`mailto:${profile.email}?subject=${subject}&body=${body}`);
    setSent(true);
  }

  return (
    <div className="terminal__rich to-contact" style={style}>
      <p className="to-contact__links">
        <a href={`mailto:${profile.email}`}>{profile.email}</a>
        {profile.socials.map((link) => (
          <a key={link.href} href={link.href} target="_blank" rel="me noreferrer">
            {link.label} ↗
          </a>
        ))}
      </p>
      <form className="to-form" onSubmit={submit}>
        <label>
          <span>name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
          />
        </label>
        <label>
          <span>email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label>
          <span>message</span>
          <textarea
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            required
          />
        </label>
        <p className="to-form__actions">
          <button type="submit">send →</button>
          {sent && <span className="to-form__sent">✓ opening your mail client…</span>}
        </p>
      </form>
    </div>
  );
}

export function CvOutput({ style }: OutputProps) {
  return (
    <div className="terminal__rich to-cv" style={style}>
      <p className="to-cv__actions">
        <a className="to-button" href="/cv.pdf" download>
          ↓ cv.pdf
        </a>
        <a className="to-button to-button--ghost" href="/cv/">
          open cv page
        </a>
      </p>
      <div className="to-cv__preview">
        <p className="to-cv__name">
          {profile.name} — {profile.role} · {profile.location}
        </p>
        {experience.map((item) => (
          <p key={`${item.company}-${item.period}`}>
            <span className="to-cv__period">{item.period}</span> {item.role},{" "}
            {item.company}
          </p>
        ))}
        <p>
          <span className="to-cv__period">skills</span>{" "}
          {skillGroups.map((group) => group.title.toLowerCase()).join(" / ")}
        </p>
      </div>
    </div>
  );
}
