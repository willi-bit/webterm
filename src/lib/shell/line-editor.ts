/**
 * Pure line-editing logic: decoding terminal input into keys, applying
 * edits, and computing where the cursor lands on wrapped lines. The xterm
 * host feeds it bytes and writes what it returns; tests drive it directly.
 */

export type Key =
  | { type: "text"; text: string }
  | {
      type:
        | "enter"
        | "backspace"
        | "delete"
        | "left"
        | "right"
        | "up"
        | "down"
        | "home"
        | "end"
        | "wordLeft"
        | "wordRight"
        | "tab"
        | "interrupt"
        | "clearScreen"
        | "killStart"
        | "killEnd"
        | "killWord"
        | "eof"
        | "escape";
    };

type ControlKey = Exclude<Key["type"], "text">;

const sequences: Record<string, ControlKey> = {
  "\x1b[A": "up",
  "\x1bOA": "up",
  "\x1b[B": "down",
  "\x1bOB": "down",
  "\x1b[C": "right",
  "\x1bOC": "right",
  "\x1b[D": "left",
  "\x1bOD": "left",
  "\x1b[H": "home",
  "\x1bOH": "home",
  "\x1b[1~": "home",
  "\x1b[7~": "home",
  "\x1b[F": "end",
  "\x1bOF": "end",
  "\x1b[4~": "end",
  "\x1b[8~": "end",
  "\x1b[3~": "delete",
  "\x1b[1;5D": "wordLeft",
  "\x1b[1;3D": "wordLeft",
  "\x1bb": "wordLeft",
  "\x1b[1;5C": "wordRight",
  "\x1b[1;3C": "wordRight",
  "\x1bf": "wordRight",
  "\x1b\x7f": "killWord",
};

const controls: Record<string, ControlKey> = {
  "\r": "enter",
  "\n": "enter",
  "\x7f": "backspace",
  "\b": "backspace",
  "\t": "tab",
  "\x03": "interrupt",
  "\x0c": "clearScreen",
  "\x01": "home",
  "\x05": "end",
  "\x02": "left",
  "\x06": "right",
  "\x10": "up",
  "\x0e": "down",
  "\x15": "killStart",
  "\x0b": "killEnd",
  "\x17": "killWord",
  "\x04": "eof",
};

/**
 * Characters the editor accepts. Everything the shell draws is one cell
 * wide, so wide glyphs (CJK, emoji) are dropped rather than misaligning
 * the cursor.
 */
function isNarrowPrintable(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f || (code >= 0x80 && code < 0xa0)) {
    return false;
  }
  return code < 0x1100 || (code >= 0x2010 && code <= 0x27bf) || (code >= 0x2900 && code <= 0x2bff);
}

/** Decodes an xterm `onData` chunk (keystrokes or a paste) into keys. */
export function decodeInput(data: string): Key[] {
  const keys: Key[] = [];
  let text = "";
  const flush = () => {
    if (text) {
      keys.push({ type: "text", text });
      text = "";
    }
  };

  let index = 0;
  while (index < data.length) {
    const rest = data.slice(index);

    if (rest.startsWith("\x1b")) {
      flush();
      const known = Object.keys(sequences)
        .filter((sequence) => rest.startsWith(sequence))
        .sort((a, b) => b.length - a.length)[0];
      if (known) {
        keys.push({ type: sequences[known]! });
        index += known.length;
        continue;
      }
      // Unknown CSI/SS3 sequences are swallowed whole; a bare ESC is a key.
      const unknown = /^\x1b(?:\[[0-9;?]*[ -/]*[@-~]|O.)/.exec(rest);
      if (unknown) {
        index += unknown[0].length;
      } else {
        keys.push({ type: "escape" });
        index += 1;
      }
      continue;
    }

    const character = String.fromCodePoint(rest.codePointAt(0)!);
    const control = controls[character];
    if (control) {
      flush();
      // Treat CRLF from pastes as a single Enter.
      if (!(character === "\n" && data[index - 1] === "\r")) {
        keys.push({ type: control });
      }
    } else if (isNarrowPrintable(character)) {
      text += character;
    }
    index += character.length;
  }
  flush();
  return keys;
}

export interface EditorState {
  /** Code points, so the cursor never lands inside a surrogate pair. */
  chars: string[];
  cursor: number;
}

export function createState(value = ""): EditorState {
  const chars = [...value];
  return { chars, cursor: chars.length };
}

export function valueOf(state: EditorState): string {
  return state.chars.join("");
}

const isWordChar = (character: string | undefined) =>
  character !== undefined && /[\p{L}\p{N}_-]/u.test(character);

function wordStart(chars: string[], from: number): number {
  let index = from;
  while (index > 0 && !isWordChar(chars[index - 1])) {
    index -= 1;
  }
  while (index > 0 && isWordChar(chars[index - 1])) {
    index -= 1;
  }
  return index;
}

function wordEnd(chars: string[], from: number): number {
  let index = from;
  while (index < chars.length && !isWordChar(chars[index])) {
    index += 1;
  }
  while (index < chars.length && isWordChar(chars[index])) {
    index += 1;
  }
  return index;
}

/** Applies an editing key. Keys that aren't edits return the state as is. */
export function edit(state: EditorState, key: Key): EditorState {
  const { chars, cursor } = state;
  switch (key.type) {
    case "text": {
      const inserted = [...key.text];
      return {
        chars: [...chars.slice(0, cursor), ...inserted, ...chars.slice(cursor)],
        cursor: cursor + inserted.length,
      };
    }
    case "backspace":
      return cursor === 0
        ? state
        : { chars: [...chars.slice(0, cursor - 1), ...chars.slice(cursor)], cursor: cursor - 1 };
    case "delete":
    case "eof":
      return cursor >= chars.length
        ? state
        : { chars: [...chars.slice(0, cursor), ...chars.slice(cursor + 1)], cursor };
    case "left":
      return { chars, cursor: Math.max(0, cursor - 1) };
    case "right":
      return { chars, cursor: Math.min(chars.length, cursor + 1) };
    case "home":
      return { chars, cursor: 0 };
    case "end":
      return { chars, cursor: chars.length };
    case "wordLeft":
      return { chars, cursor: wordStart(chars, cursor) };
    case "wordRight":
      return { chars, cursor: wordEnd(chars, cursor) };
    case "killStart":
      return { chars: chars.slice(cursor), cursor: 0 };
    case "killEnd":
      return { chars: chars.slice(0, cursor), cursor };
    case "killWord": {
      const start = wordStart(chars, cursor);
      return { chars: [...chars.slice(0, start), ...chars.slice(cursor)], cursor: start };
    }
    default:
      return state;
  }
}

export interface CursorMove {
  /** Rows from the input line's first row to the cursor. */
  row: number;
  /** Escape sequence that moves from the end of the drawn text to the cursor. */
  sequence: string;
}

/**
 * After writing `promptWidth + textWidth` cells, where must the cursor go
 * to sit at `promptWidth + cursor`? Handles xterm's pending-wrap state when
 * the text ends exactly at the right margin.
 */
export function placeCursor(
  promptWidth: number,
  drawnWidth: number,
  cursorOffset: number,
  cols: number,
): CursorMove {
  const end = promptWidth + drawnWidth;
  const target = promptWidth + cursorOffset;
  const pendingWrap = end > 0 && end % cols === 0;
  const endRow = pendingWrap ? end / cols - 1 : Math.floor(end / cols);
  const targetRow = Math.floor(target / cols);
  const targetCol = target % cols;

  if (pendingWrap && target === end) {
    // The cursor belongs at the start of the next (not yet existing) row.
    return { row: targetRow, sequence: "\r\n" };
  }
  const up = endRow - targetRow;
  return {
    row: targetRow,
    sequence: `${up > 0 ? `\x1b[${up}A` : ""}\x1b[${targetCol + 1}G`,
  };
}

/** Rows a line of `size` cells occupies at `cols` columns. */
export function rowsFor(size: number, cols: number): number {
  return Math.max(1, Math.ceil(size / cols));
}
