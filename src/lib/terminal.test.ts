import { describe, expect, it } from "vitest";
import {
  bootCommands,
  commonPrefix,
  completionToken,
  executeCommand,
  fileSystem,
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

describe("completionToken", () => {
  it("splits the input at the last whitespace", () => {
    expect(completionToken("cat in")).toEqual({ before: "cat ", token: "in" });
    expect(completionToken("who")).toEqual({ before: "", token: "who" });
  });

  it("treats a trailing space as an empty fresh token", () => {
    expect(completionToken("cat ")).toEqual({ before: "cat ", token: "" });
    expect(completionToken("")).toEqual({ before: "", token: "" });
  });
});

describe("getCompletions", () => {
  it("completes unambiguous command prefixes", () => {
    expect(getCompletions("proj")).toEqual(["project", "projects"]);
    expect(getCompletions("who")).toEqual(["whoami"]);
  });

  it("completes file arguments for cat", () => {
    expect(getCompletions("cat in")).toEqual(["intro.txt"]);
    expect(getCompletions("cat read")).toEqual(["README.md"]);
  });

  it("matches arguments case-insensitively, even for the command", () => {
    expect(getCompletions("CAT I")).toEqual(["intro.txt"]);
  });

  it("offers the whole virtual filesystem right after `cat `", () => {
    // ls, cat, and completion all read from this one listing.
    expect(getCompletions("cat ")).toEqual(fileSystem.map((entry) => entry.name));
  });

  it("completes page names for open", () => {
    expect(getCompletions("open a")).toEqual(["about"]);
    expect(getCompletions("open c")).toEqual(["cv", "contact"]);
  });

  it("completes project slugs for project", () => {
    expect(getCompletions("project web")).toEqual(["webterm-portfolio"]);
    expect(getCompletions("project ")).toHaveLength(2);
  });

  it("offers nothing for commands that take no argument", () => {
    expect(getCompletions("sudo ")).toEqual([]);
    expect(getCompletions("clear everything")).toEqual([]);
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

  it("serves files regardless of casing", () => {
    expect(textLines(executeCommand("cat README.md")).length).toBeGreaterThan(0);
    expect(textLines(executeCommand("cat readme.md")).length).toBeGreaterThan(0);
  });

  it("tells directories apart from missing files", () => {
    for (const query of ["projects", "experience/"]) {
      const result = executeCommand(`cat ${query}`);
      expect(textLines(result)[0]?.tone).toBe("error");
      expect(textLines(result)[0]?.text).toContain("Is a directory");
    }
  });

  it("reports missing files as errors", () => {
    const result = executeCommand("cat secrets.env");
    expect(textLines(result)[0]?.tone).toBe("error");
    expect(textLines(result)[0]?.text).toContain("no such file or directory");
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
