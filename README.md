# Webterm portfolio

A functional prototype for a terminal-first personal portfolio. The home page
*is* the terminal: it boots itself, answers commands, and renders results as
real UI. Conventional routes still exist for search engines and visitors
without JavaScript. The generated site is configured for Cloudflare Workers
Static Assets.

## Architecture

```text
src/data/site.ts                 Portfolio content and shared types
src/lib/terminal.ts              Framework-independent command engine
src/components/Terminal.tsx      Interactive React terminal (boot, chips, chrome)
src/components/terminal-outputs.tsx  Rendered command output (cards, timeline, form)
src/pages/                       Conventional, indexable portfolio routes
src/layouts/BaseLayout.astro     Shared document shell and navigation
src/styles/global.css            Webterm design system (near-black, one accent)
wrangler.jsonc                   Cloudflare static-assets deployment
```

The terminal and regular pages read from the same data module, avoiding two
independent versions of the portfolio.

How the pieces interact:

- The home page is bare: no navbar, no hero, just the terminal filling the
  viewport (`BaseLayout.astro` renders it with `bare`). Subpages keep the
  conventional header for orientation and no-JS access.
- On load the terminal types a boot sequence (`whoami`, `cat intro.txt`,
  `help`) so first-time visitors never see an empty box. Reduced-motion
  visitors get the same output instantly.
- One-tap command chips under the input (`about`, `projects`, `cv`,
  `contact`, `help`) cover visitors who don't want to type.
- `/?run=<command>` deep-links replay a command after boot.
- Commands return typed output from the engine: plain text lines with
  semantic tones, or rich kinds (`projects`, `experience`, `contact`, `cv`,
  `ls`) that React renders as components — cards, a timeline, a working
  contact form (mailto compose), a CV preview with download, and a
  color-coded file listing.
- The window chrome works: red minimizes to a dock button, amber collapses to
  the input line, green maximizes edge-to-edge (Escape restores).

## Local development

Requirements:

- Node.js 22.12 or newer
- npm 10 or newer

Install dependencies and start Astro:

```bash
npm install
npm run dev
```

Then visit `http://localhost:4321`.

## Validation

```bash
npm run validate
```

This runs Astro's type/content checks, terminal-engine tests, and a production
build.

## Portfolio content

The shared content in `src/data/site.ts` contains:

- identity, location, introduction, biography, contact details, and social links
- education, selected coursework, and languages
- experience entries
- projects and their links
- skill groups

Project detail routes and terminal output are generated from those same
records. The English CV is available at `public/cv.pdf`.

## Cloudflare

This project uses Astro's static output and does not need the
`@astrojs/cloudflare` adapter. `wrangler.jsonc` points Cloudflare at `./dist`.

Preview the production build using Cloudflare's local runtime:

```bash
npm run cf:preview
```

After configuring Cloudflare authentication and choosing the final Worker name:

```bash
npm run cf:deploy
```

Before the first deployment, update `name` in `wrangler.jsonc` if
`webterm-portfolio` is not the desired Cloudflare Worker name.

If server-rendered routes, D1, KV, or other bindings are added later, install
Astro's Cloudflare adapter at that point:

```bash
npx astro add cloudflare
```

Do not add it solely for the current static site.

## Styling

The design system is defined as CSS custom properties at the top of
`src/styles/global.css`: a near-black canvas (`#0a0a12`), one green accent
(`#50fa7b`) for the prompt, links, and interactive elements, and semantic
colors for output types — user input in bright text, system output in muted
gray, errors in red, directories in blue, executables in green, documents in
amber. Adjust the palette, fonts, and spacing there without changing the
command engine or content model. Preserve:

- visible keyboard focus
- the skip link and semantic navigation
- readable content outside the terminal
- terminal form labels and `role="log"`
- the no-JavaScript fallback
- instant (non-animated) boot under `prefers-reduced-motion`
