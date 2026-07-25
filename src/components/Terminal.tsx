import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  bootCommands,
  commonPrefix,
  executeCommand,
  getCompletions,
  type OutputItem,
} from "../lib/terminal";
import {
  ContactOutput,
  CvOutput,
  ExperienceOutput,
  LsOutput,
  ProjectsOutput,
} from "./terminal-outputs";

interface TerminalEntry {
  id: number;
  command?: string;
  output: OutputItem[];
}

type WindowMode = "normal" | "minimized" | "collapsed" | "maximized";

const quickCommands = ["about", "projects", "cv", "contact", "help"] as const;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new Error("boot aborted"));
      },
      { once: true },
    );
  });
}

function OutputItemView({ item, index }: { item: OutputItem; index: number }) {
  const style: CSSProperties = {
    animationDelay: `${Math.min(index * 45, 360)}ms`,
  };

  switch (item.kind) {
    case "ls":
      return <LsOutput style={style} />;
    case "projects":
      return <ProjectsOutput style={style} />;
    case "experience":
      return <ExperienceOutput style={style} />;
    case "contact":
      return <ContactOutput style={style} />;
    case "cv":
      return <CvOutput style={style} />;
    default: {
      const tone = item.tone ?? "default";
      return (
        <p className={`terminal__output terminal__output--${tone}`} style={style}>
          {item.href ? (
            <a
              href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noreferrer" : undefined}
            >
              {item.text}
            </a>
          ) : (
            item.text
          )}
        </p>
      );
    }
  }
}

export default function Terminal() {
  const [entries, setEntries] = useState<TerminalEntry[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [bootText, setBootText] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [mode, setMode] = useState<WindowMode>("normal");
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const appendEntry = useCallback(
    (command: string | undefined, output: OutputItem[]) => {
      setEntries((current) => [
        ...current,
        command
          ? { id: nextId.current++, command, output }
          : { id: nextId.current++, output },
      ]);
    },
    [],
  );

  const runCommand = useCallback(
    (raw: string) => {
      const command = raw.trim();
      if (!command) {
        return;
      }

      const result = executeCommand(command);
      setHistory((current) => [...current, command]);
      setHistoryIndex(null);
      setInput("");

      if (result.clear) {
        setEntries([]);
      } else {
        appendEntry(command, result.output);
      }

      if (result.navigateTo) {
        window.location.assign(result.navigateTo);
      }
    },
    [appendEntry],
  );

  // Boot sequence: the terminal types its first commands by itself so
  // first-time visitors never see an empty box. Skipped when the user
  // prefers reduced motion.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const controller = new AbortController();
    const { signal } = controller;

    async function boot() {
      try {
        for (const command of bootCommands) {
          if (reduced) {
            appendEntry(command, executeCommand(command).output);
            continue;
          }
          await sleep(420, signal);
          for (let i = 1; i <= command.length; i += 1) {
            setBootText(command.slice(0, i));
            await sleep(30 + Math.random() * 45, signal);
          }
          await sleep(180, signal);
          setBootText(null);
          appendEntry(command, executeCommand(command).output);
        }
      } catch {
        // Aborted on unmount — nothing to clean up.
      } finally {
        setBootText(null);
      }

      // Deep links like /?run=projects replay a command after boot.
      const url = new URL(window.location.href);
      const wanted = url.searchParams.get("run");
      if (wanted) {
        url.searchParams.delete("run");
        window.history.replaceState(null, "", url);
        runCommand(wanted);
      }
    }

    boot();
    return () => controller.abort();
  }, [appendEntry, runCommand]);

  // The top navigation dispatches "webterm:run" events instead of routing
  // when the terminal is on the page.
  useEffect(() => {
    function onRun(event: Event) {
      const command = (event as CustomEvent<string>).detail;
      if (typeof command !== "string") {
        return;
      }
      setMode((current) => (current === "minimized" ? "normal" : current));
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      runCommand(command);
      inputRef.current?.focus({ preventScroll: true });
    }

    window.addEventListener("webterm:run", onRun);
    return () => window.removeEventListener("webterm:run", onRun);
  }, [runCommand]);

  // Keep the log pinned to the newest entry.
  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries, bootText]);

  // Maximized mode owns the viewport: lock page scroll and allow Escape.
  useEffect(() => {
    if (mode !== "maximized") {
      return;
    }
    document.body.style.overflow = "hidden";
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setMode("normal");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mode]);

  const ghost = useMemo(() => {
    const [best] = getCompletions(input);
    if (best === undefined) {
      return "";
    }
    const typed = input.trimStart().toLowerCase();
    return best.startsWith(typed) ? best.slice(typed.length) : "";
  }, [input]);

  function submitCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runCommand(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (history.length === 0) {
        return;
      }
      const nextIndex =
        historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInput(history[nextIndex] ?? "");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (historyIndex === null) {
        return;
      }
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInput("");
      } else {
        setHistoryIndex(nextIndex);
        setInput(history[nextIndex] ?? "");
      }
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const completions = getCompletions(input);
      if (completions.length === 0) {
        return;
      }
      if (completions.length === 1) {
        setInput(`${completions[0]} `);
        return;
      }
      const prefix = commonPrefix(completions);
      if (prefix.length > input.trimStart().length) {
        setInput(prefix);
      } else {
        appendEntry(undefined, [
          { kind: "text", text: completions.join("  "), tone: "muted" },
        ]);
      }
    }
  }

  function focusInput() {
    if (window.getSelection()?.isCollapsed) {
      inputRef.current?.focus();
    }
  }

  if (mode === "minimized") {
    return (
      <button
        type="button"
        className="terminal-dock"
        onClick={() => setMode("normal")}
        aria-label="Restore terminal window"
      >
        <span aria-hidden="true">&gt;_</span> terminal
      </button>
    );
  }

  const windowClass = [
    "terminal",
    mode === "maximized" ? "terminal--maximized" : "",
    mode === "collapsed" ? "terminal--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      ref={sectionRef}
      className={windowClass}
      aria-label="Interactive portfolio terminal"
      data-terminal
      onClick={focusInput}
    >
      <header className="terminal__header">
        <div className="terminal__controls" role="group" aria-label="Window controls">
          <button
            type="button"
            className="terminal__dot terminal__dot--close"
            title="Minimize to dock"
            aria-label="Minimize terminal to dock"
            onClick={(event) => {
              event.stopPropagation();
              setMode("minimized");
            }}
          />
          <button
            type="button"
            className="terminal__dot terminal__dot--collapse"
            title={mode === "collapsed" ? "Expand output" : "Collapse to input line"}
            aria-label={
              mode === "collapsed" ? "Expand terminal output" : "Collapse terminal to input line"
            }
            onClick={(event) => {
              event.stopPropagation();
              setMode((current) => (current === "collapsed" ? "normal" : "collapsed"));
            }}
          />
          <button
            type="button"
            className="terminal__dot terminal__dot--maximize"
            title={mode === "maximized" ? "Restore window" : "Maximize to fill viewport"}
            aria-label={mode === "maximized" ? "Restore terminal window" : "Maximize terminal"}
            onClick={(event) => {
              event.stopPropagation();
              setMode((current) => (current === "maximized" ? "normal" : "maximized"));
            }}
          />
        </div>
        <div className="terminal__title">
          <img src="/icons/favicon-32.png" width="24" height="24" alt="" />
          <p>visitor@portfolio:~</p>
        </div>
        <button
          type="button"
          className="terminal__clear"
          onClick={(event) => {
            event.stopPropagation();
            setEntries([]);
          }}
        >
          Clear
        </button>
      </header>

      {mode !== "collapsed" && (
        <div
          ref={logRef}
          className="terminal__body"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {entries.map((entry) => (
            <div className="terminal__entry" key={entry.id}>
              {entry.command && (
                <p className="terminal__command">
                  <span className="terminal__prompt" aria-hidden="true">
                    $&nbsp;
                  </span>
                  {entry.command}
                </p>
              )}
              {entry.output.map((item, index) => (
                <OutputItemView key={`${entry.id}-${index}`} item={item} index={index} />
              ))}
            </div>
          ))}
          {bootText !== null && (
            <p className="terminal__command">
              <span className="terminal__prompt" aria-hidden="true">
                $&nbsp;
              </span>
              {bootText}
              <span className="terminal__caret" aria-hidden="true" />
            </p>
          )}
        </div>
      )}

      <form className="terminal__form" onSubmit={submitCommand}>
        <span className="terminal__prompt" aria-hidden="true">
          $
        </span>
        <label className="visually-hidden" htmlFor="terminal-command">
          Terminal command
        </label>
        <span className="terminal__field">
          <span className="terminal__overlay" aria-hidden="true">
            <span className="terminal__mirror">{input}</span>
            <span
              className={
                focused ? "terminal__caret terminal__caret--off" : "terminal__caret"
              }
            />
            <span className="terminal__ghost">{ghost}</span>
          </span>
          <input
            ref={inputRef}
            id="terminal-command"
            className="terminal__input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="send"
          />
        </span>
      </form>

      <div className="terminal__chips" role="group" aria-label="Quick commands">
        {quickCommands.map((command) => (
          <button
            key={command}
            type="button"
            className="terminal__chip"
            onClick={() => {
              runCommand(command);
              inputRef.current?.focus();
            }}
          >
            {command}
          </button>
        ))}
      </div>
    </section>
  );
}
