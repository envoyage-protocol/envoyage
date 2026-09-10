import {describe, expect, it} from "vitest";
import {parseLookup} from "../lookup";

describe("parseLookup", () => {
  it("reads a bare integer as a mandate number", () => {
    expect(parseLookup("1")).toEqual({kind: "mandate", id: 1n});
  });
  it("reads a full name as a position", () => {
    expect(parseLookup("38896.envoyage.eth")).toEqual({kind: "position", id: 38896n, name: "38896.envoyage.eth"});
  });
  it("treats a dot-less label as a name when asked to", () => {
    expect(parseLookup("38896", {asName: true})).toEqual({kind: "position", id: 38896n, name: "38896.envoyage.eth"});
  });
  it("rejects a name that is not a position label, with a sentence", () => {
    const r = parseLookup("alice.envoyage.eth");
    expect(r.kind).toBe("invalid");
    expect((r as {reason: string}).reason).toMatch(/position numbers/);
  });
  it("rejects a name under another parent", () => {
    const r = parseLookup("vitalik.eth");
    expect(r.kind).toBe("invalid");
    expect((r as {reason: string}).reason).toMatch(/envoyage\.eth/);
  });
  it("rejects empty input", () => {
    expect(parseLookup("   ").kind).toBe("invalid");
  });
});
