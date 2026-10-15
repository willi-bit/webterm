# Webterm portfolio

A terminal-first personal portfolio. The home page is a real terminal
emulator ([xterm.js](https://xtermjs.org)) running a small hand-written shell,
set in a desktop of TUI panels. Every section also exists as a plain,
indexable document page for search engines, sharing, printing, and visitors
without JavaScript. The generated site is configured for Cloudflare Workers
Static Assets.

## Architecture

```text
src/data/site.ts               Portfolio content and shared types (single source)
src/lib/themes.ts              Color themes → CSS custom properties and xterm palette
src/lib/theme-client.ts        Browser theme/CRT state and the shared DOM events
src/lib/dates.ts               Period and duration formatting
src/lib/shell/
  ansi.ts                      Truecolor styles, OSC 8 links, wrap/flow/box layout
  render.ts                    Command output as functions of (width, theme)
  commands.ts                  Command registry, parsing, completion, execution
  line-editor.ts               Pure line editing: key decoding, edits, cursor math
  vfs.ts                       The virtual filesystem (ls, cd, cat, tree, open)
  host.ts                      xterm.js host: transcript, readline loop, links, boot
  types.ts                     ShellIO and rendering contracts
  shell.test.ts                Engine tests (run with an in-memory ShellIO)
src/components/Shell.tsx       React island: terminal panel, function bar, status
src/components/Panel.astro     The TUI panel (title set into the border)
src/components/DocShell.astro  Document frame: explorer tree, buffer, statusline
src/layouts/BaseLayout.astro   Document shell, top bar (workspaces, theme, clock)
src/pages/                     Home desktop and the document pages
src/styles/global.css          Layout and components (colors come from themes.ts)
public/fonts/                  Self-hosted JetBrains Mono subset (OFL-1.1)
```

How the pieces fit:

- **The terminal is a terminal.** xterm.js renders it (WebGL when the device
  reports a correctly sized canvas, otherwise the DOM renderer). The shell on
  top is ours: a line editor with history, fish-style syntax highlighting and
  autosuggestions, context-aware tab completion, `&&`/`;` chaining, `$VAR`
  expansion, and typeahead.
- **Output is re-layoutable.** Commands print `Renderable`s, functions of the
  terminal width and theme. The host keeps a transcript and lays it out again
  when the window is resized or the theme changes, so boxes, wrapping, and
  colors are always right.
- **Everything is clickable.** Commands, files, and links in the output are
  OSC 8 hyperlinks: `cmd:` runs a command, `http(s):` and `mailto:` open. The function bar under the terminal and the side panels
  (profile, career `git log`, projects) run commands too, so nobody has to type.
- **Startup.** The first visit in a session plays a short boot log and types
  `neofetch`; later visits start instantly. Reduced-motion visitors never see
  animations. `/?run=<command>` deep-links run a command after the welcome.
- **One source of truth.** The terminal, the side panels, and the document
  pages all render `src/data/site.ts`. `profile.email` and `profile.photo`
  are optional: leave them unset and every page and the terminal hide them
  (no email links, no `mail` command, no portrait).

## The shell

Portfolio: `about`, `experience`, `projects`, `project <slug>`, `skills`,
`education`, `cv`, `contact`, `mail` (a clack-style compose wizard that hands
off to the visitor's mail client; only present while an email is
configured), `neofetch`.

System: `ls [-la]`, `cd` (incl. `cd -` and auto-cd), `cat`, `tree`, `pwd`,
`open <page|file|url>`, `theme [name]`, `crt [on|off]`, `history`, `clear`, `copy`, `echo`, `env`, `date`,
`whoami`, `uname`, `man <command>` (try `man willi`), `exit`.

Keys: Tab completes, ↑/↓ walk the history (prefix-filtered), → accepts the
grey suggestion, Ctrl+C cancels, Ctrl+L clears, Ctrl+A/E/U/K/W edit, Ctrl+D
on an empty line exits. Esc leaves the terminal for the function bar and
Shift+Tab moves focus back, so keyboard users are never trapped.

To add a command, add an entry to the registry in `commands.ts` (name,
summary, optional `complete`, `run`) and a renderer in `render.ts` if it
prints anything rich. The layout test renders every command at 40–140
columns and fails if a line overflows.

## Design

The visual language is a tiling-window-manager desktop with TUI panels in
the spirit of btop and lazygit: rounded hairline borders with titles set into
the top edge, the focused panel lit in the accent color, one monospace face
everywhere. The terminal draws the same shapes with box-drawing characters,
so HTML and shell output read as one interface.

- **Top bar:** workspaces (the site navigation), theme picker, Leipzig clock.
- **Home:** the terminal panel plus profile, career `git log`, and projects
  panels on wide screens.
- **Documents:** an explorer tree (like neo-tree), the page rendered like
  `glow` (badge H1, visible `##` marks), and a vim statusline with the scroll
  position. The CV is a sheet of paper in a zathura-style viewer and prints as
  a clean document.
- **Themes** (`src/lib/themes.ts`): webterm (default), rosé pine, dracula,
  catppuccin, tokyo night, gruvbox, amber crt, and the light theme paper. Each
  theme is one object; its CSS custom properties are generated into the page
  head, and the terminal reads the same values. The saved theme is applied
  before first paint. Add a theme by adding an object to the list.

The font is JetBrains Mono, subset to Latin plus the symbol ranges the shell
uses (arrows, box drawing, blocks, geometric shapes, dingbats) into one 48 KB
variable woff2. To regenerate it from the official release with fontTools:

```bash
pyftsubset "JetBrainsMono[wght].ttf" \
  --unicodes="U+0020-007E,U+00A0-017F,U+0192,U+02C6-02DC,U+0300-0308,U+2000-206F,U+20AC,U+2100-215F,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+2500-259F,U+25A0-25FF,U+2600-26FF,U+2700-27BF,U+2B00-2BFF,U+E0A0-E0D4" \
  --layout-features="ccmp,locl,mark,mkmk,zero" --flavor=woff2 \
  --output-file=public/fonts/jetbrains-mono-wght.woff2
```

Please preserve:

- visible keyboard focus and the Esc / Shift+Tab exits from the terminal
- the skip link and semantic navigation
- the screen-reader live region that announces command output
- the document pages and the no-JavaScript fallback
- instant (non-animated) startup under `prefers-reduced-motion`

## Local development

Requirements: Node.js 22.12 or newer, npm 10 or newer.

```bash
npm install
npm run dev
```

Then visit `http://localhost:4321`.

## Validation

```bash
npm run validate
```

This runs Astro's type checks, the shell tests, and a production build.

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

Pushes to `main` deploy automatically through Cloudflare Workers Builds (the
Git integration configured in the Cloudflare dashboard under the Worker's
Settings → Builds). There is no GitHub Actions workflow, and `npm run cf:deploy`
is only needed for one-off manual deploys. Build and deploy logs are in the
dashboard. Don't also add a GitHub
Actions deploy, or every push will deploy twice.

If server-rendered routes, D1, KV, or other bindings are added later, install
Astro's Cloudflare adapter at that point (`npx astro add cloudflare`). Do not
add it solely for the current static site.
