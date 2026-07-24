import {
  type KeyboardEvent,
  type SyntheticEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  executeCommand,
  getCompletions,
  type OutputItem,
} from "../lib/terminal";

interface TerminalEntry {
  id: number;
  command?: string;
  output: OutputItem[];
}

const initialEntries: TerminalEntry[] = [
  {
    id: 0,
    output: [
      { text: "Portfolio terminal prototype" },
      { text: "Type help to see available commands." },
    ],
  },
];

export default function Terminal() {
  const [entries, setEntries] = useState<TerminalEntry[]>(initialEntries);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const nextId = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({
      top: logRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries]);

  function appendEntry(command: string | undefined, output: OutputItem[]) {
    const entry: TerminalEntry = command
      ? { id: nextId.current++, command, output }
      : { id: nextId.current++, output };

    setEntries((current) => [
      ...current,
      entry,
    ]);
  }

  function submitCommand(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    const command = input.trim();

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
      if (completions.length === 1) {
        setInput(`${completions[0]} `);
      } else if (completions.length > 1) {
        appendEntry(undefined, [{ text: completions.join("  ") }]);
      }
    }
  }

  return (
    <section className="terminal" aria-label="Interactive portfolio terminal">
      <header className="terminal__header">
        <p>visitor@portfolio:~</p>
        <button type="button" onClick={() => setEntries([])}>
          Clear
        </button>
      </header>

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
              <p className="terminal__output" key={`${entry.id}-${index}`}>
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
            ))}
          </div>
        ))}
      </div>

      <form className="terminal__form" onSubmit={submitCommand}>
        <span className="terminal__prompt" aria-hidden="true">
          $
        </span>
        <label className="visually-hidden" htmlFor="terminal-command">
          Terminal command
        </label>
        <input
          ref={inputRef}
          id="terminal-command"
          className="terminal__input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="send"
        />
      </form>
      <p className="terminal__hint">
        This interface is optional. All content is also available through the navigation.
      </p>
    </section>
  );
}
