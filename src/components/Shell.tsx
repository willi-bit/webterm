import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import type { ShellHost } from "../lib/shell/host";
import {
  RUN_EVENT,
  THEME_EVENT,
  crtEnabled,
  currentTheme,
  setCrt,
  setDocumentTheme,
} from "../lib/theme-client";
import { findTheme } from "../lib/themes";

/** One-tap commands in the panel's bottom bar — no typing required. */
const functionKeys = [
  "help",
  "about",
  "experience",
  "projects",
  "skills",
  "cv",
  "contact",
  "theme",
] as const;

/**
 * The terminal panel. xterm.js and the shell are loaded on the client
 * only; the server-rendered markup shows a static welcome until then.
 */
export default function Shell() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<ShellHost | null>(null);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState("");
  const [hover, setHover] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [exited, setExited] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    let cancelled = false;
    let host: ShellHost | null = null;

    const url = new URL(window.location.href);
    const initialCommand = url.searchParams.get("run");
    if (initialCommand) {
      url.searchParams.delete("run");
      window.history.replaceState(null, "", url);
    }

    void import("../lib/shell/host")
      .then(({ ShellHost: Host }) => {
        if (cancelled) {
          return;
        }
        host = new Host(
          viewport,
          {
            theme: currentTheme(),
            crt: crtEnabled(),
            reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
            initialCommand,
          },
          {
            onThemeChange: (theme) => setDocumentTheme(theme),
            onCrtChange: (on) => setCrt(on),
            onSize: (cols, rows) => setSize(`${cols}×${rows}`),
            onHover: setHover,
            onScrollState: setAtBottom,
            onExit: setExited,
            onEscape: () => viewportRef.current?.closest(".panel")?.querySelector<HTMLButtonElement>(".shell__key")?.focus(),
            announce: setAnnouncement,
          },
        );
        hostRef.current = host;
        setReady(true);
        return host.start();
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    const onRun = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command && hostRef.current) {
        hostRef.current.runCommand(command);
        if (window.matchMedia("(pointer: fine)").matches) {
          hostRef.current.focus();
        }
      }
    };
    const onTheme = (event: Event) => {
      const theme = findTheme((event as CustomEvent<string>).detail);
      if (theme) {
        hostRef.current?.applyTheme(theme);
      }
    };
    window.addEventListener(RUN_EVENT, onRun);
    window.addEventListener(THEME_EVENT, onTheme);

    return () => {
      cancelled = true;
      window.removeEventListener(RUN_EVENT, onRun);
      window.removeEventListener(THEME_EVENT, onTheme);
      host?.dispose();
      hostRef.current = null;
    };
  }, []);

  const run = (command: string) => {
    hostRef.current?.runCommand(command);
    if (window.matchMedia("(pointer: fine)").matches) {
      hostRef.current?.focus();
    }
  };

  return (
    <section className="panel panel--shell" aria-label="Interactive terminal">
      <header className="panel__title">
        <span className="panel__label">
          <span className="panel__glyph" aria-hidden="true">
            &gt;_
          </span>
          wsh
        </span>
        <span className="panel__meta">~/portfolio</span>
      </header>

      <div className="shell">
        <div
          ref={viewportRef}
          className="shell__viewport"
          data-ready={ready || undefined}
        />

        {!ready && !failed && (
          <div className="shell__fallback" aria-hidden="true">
            <p>
              <span className="shell__spinner" /> starting wsh…
            </p>
          </div>
        )}

        {failed && (
          <div className="shell__fallback">
            <p>The terminal couldn't start in this browser.</p>
            <p>
              Browse the plain pages instead: <a href="/about/">about</a> ·{" "}
              <a href="/experience/">experience</a> · <a href="/projects/">projects</a> ·{" "}
              <a href="/cv/">cv</a> · <a href="/contact/">contact</a>
            </p>
          </div>
        )}

        {!atBottom && !exited && (
          <button
            type="button"
            className="shell__jump"
            onClick={() => hostRef.current?.scrollToBottom()}
          >
            ↓ back to prompt
          </button>
        )}

        {exited && (
          <button
            type="button"
            className="shell__overlay"
            onClick={() => hostRef.current?.wake()}
          >
            <span className="shell__overlay-title">session ended</span>
            <span>press any key or click to log in again</span>
          </button>
        )}

        <div className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </div>
      </div>

      <footer className="panel__footer shell__bar">
        <div className="shell__keys" role="group" aria-label="Quick commands">
          {functionKeys.map((command) => (
            <button
              key={command}
              type="button"
              className="shell__key"
              onClick={() => run(command)}
            >
              {command}
            </button>
          ))}
        </div>
        <span className="panel__status" aria-hidden="true">
          {hover ?? size}
        </span>
      </footer>
    </section>
  );
}
