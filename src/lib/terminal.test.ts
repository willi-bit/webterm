import { describe, expect, it } from "vitest";
import {
  executeCommand,
  getCompletions,
  parseCommand,
} from "./terminal";

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

describe("executeCommand", () => {
  it("returns help", () => {
    const result = executeCommand("help");
    expect(result.output[0]?.text).toBe("Available commands:");
    expect(result.output.some((line) => line.text.includes("projects"))).toBe(true);
  });

  it("lists project links from shared portfolio data", () => {
    const result = executeCommand("projects");
    expect(result.output.some((line) => line.href === "/projects/webterm-portfolio/"))
      .toBe(true);
  });

  it("opens known routes", () => {
    expect(executeCommand("open about").navigateTo).toBe("/about/");
  });

  it("rejects unknown routes", () => {
    const result = executeCommand("open nowhere");
    expect(result.navigateTo).toBeUndefined();
    expect(result.output[0]?.text).toContain("Usage:");
  });

  it("marks clear commands without output", () => {
    expect(executeCommand("clear")).toEqual({ output: [], clear: true });
  });

  it("gives useful feedback for unknown commands", () => {
    expect(executeCommand("definitely-not-real").output[0]?.text).toContain(
      "Command not found",
    );
  });
});
