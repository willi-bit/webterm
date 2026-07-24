# Webterm portfolio

A functional prototype for a terminal-inspired personal portfolio. Astro renders
the content as static HTML, while React powers the optional terminal interface.
The generated site is configured for Cloudflare Workers Static Assets.

## Architecture

```text
src/data/site.ts                 Portfolio content and shared types
src/lib/terminal.ts              Framework-independent command engine
src/components/Terminal.tsx      Interactive React terminal
src/pages/                       Conventional, indexable portfolio routes
src/layouts/BaseLayout.astro     Shared document shell and navigation
src/styles/global.css            Rosé Pine Moon design system
wrangler.jsonc                   Cloudflare static-assets deployment
```

The terminal and regular pages read from the same data module, avoiding two
independent versions of the portfolio. The terminal is progressive enhancement:
navigation and content remain usable when JavaScript is unavailable.

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

## Customize the content

Start with `src/data/site.ts`. Replace:

- `Your Name`, role, location, introduction, and biography
- placeholder email and social links
- experience entries
- projects and their links
- skill groups

Project detail routes and terminal output are generated from the same project
records. Add a final PDF as `public/cv.pdf` and link it from `src/pages/cv.astro`
when it exists.

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

The visual theme is [Rosé Pine Moon](https://rosepinetheme.com/palette), defined
as CSS custom properties at the top of `src/styles/global.css`. The pages use a
quiet, conventional layout while the terminal is styled as a distinct Rosé Pine
window. Adjust the palette, fonts, and spacing there without changing the
command engine or content model. Preserve:

- visible keyboard focus
- the skip link and semantic navigation
- readable content outside the terminal
- terminal form labels and `role="log"`
- the no-JavaScript fallback
