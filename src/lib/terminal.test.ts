import { describe, expect, it } from "vitest";
import {
  bootCommands,
  commonPrefix,
  executeCommand,
  getCompletions,
  parseCommand,
  type TextOutputItem,
} from "./terminal";

function textLines(result: ReturnType<typeof executeCommand>): TextOutputItem[] {
  return result.output.filter(
    (item): item is TextOutputItem => item.kind === "text",
  );
}

describe("parseCommand", () => {
  it("normalizes the command name and preserves arguments", () => {
    expect(parseCommand("  EcHo hello world  ")).toEqual({
      name: "echo",
      args: ["hello", "world"],
    });
  });

  it("supports quoted arguments", () => {
    expect(parseCommand('echo "hello world"')).toEqual({
      name: "echo",
      args: ["hello world"],
    });
  });
});

describe("getCompletions", () => {
  it("completes unambiguous prefixes", () => {
    expect(getCompletions("proj")).toEqual(["project", "projects"]);
    expect(getCompletions("who")).toEqual(["whoami"]);
  });

  it("does not complete arguments", () => {
    expect(getCompletions("open a")).toEqual([]);
  });
});

describe("commonPrefix", () => {
  it("finds the shared prefix", () => {
    expect(commonPrefix(["project", "projects"])).toBe("project");
    expect(commonPrefix(["about"])).toBe("about");
    expect(commonPrefix([])).toBe("");
  });
});

describe("boot sequence", () => {
  it("only runs commands that produce output", () => {
    for (const command of bootCommands) {
      const result = executeCommand(command);
      expect(result.clear).toBeUndefined();
      expect(result.output.length).toBeGreaterThan(0);
    }
  });
});

describe("executeCommand", () => {
  it("returns help", () => {
    const result = executeCommand("help");
    expect(result.output[0]).toMatchObject({ kind: "text", text: "Available commands:" });
    expect(
      textLines(result).some((line) => line.text.includes("projects")),
    ).toBe(true);
  });

  it("renders projects as a component output", () => {
    expect(executeCommand("projects").output).toEqual([{ kind: "projects" }]);
  });

  it("renders experience as a component output", () => {
    expect(executeCommand("experience").output).toEqual([{ kind: "experience" }]);
  });

  it("renders contact as a component output", () => {
    expect(executeCommand("contact").output).toEqual([{ kind: "contact" }]);
  });

  it("renders the CV as a component output instead of navigating", () => {
    const result = executeCommand("cv");
    expect(result.output).toEqual([{ kind: "cv" }]);
    expect(result.navigateTo).toBeUndefined();
  });

  it("renders ls as a component output", () => {
    expect(executeCommand("ls").output).toEqual([{ kind: "ls" }]);
  });

  it("serves virtual files with cat", () => {
    const result = executeCommand("cat intro.txt");
    expect(textLines(result)[0]?.text.length).toBeGreaterThan(0);
  });

  it("reports missing files as errors", () => {
    const result = executeCommand("cat secrets.env");
    expect(textLines(result)[0]?.tone).toBe("error");
  });

  it("turns sudo into an easter-egg error", () => {
    const result = executeCommand("sudo make me a sandwich");
    expect(textLines(result)[0]?.tone).toBe("error");
  });

  it("opens known routes", () => {
    expect(executeCommand("open about").navigateTo).toBe("/about/");
  });

  it("rejects unknown routes", () => {
    const result = executeCommand("open nowhere");
    expect(result.navigateTo).toBeUndefined();
    expect(textLines(result)[0]?.text).toContain("Usage:");
  });

  it("marks clear commands without output", () => {
    expect(executeCommand("clear")).toEqual({ output: [], clear: true });
  });

  it("gives useful feedback for unknown commands", () => {
    const result = executeCommand("definitely-not-real");
    expect(textLines(result)[0]?.text).toContain("Command not found");
    expect(textLines(result)[0]?.tone).toBe("error");
  });
});
