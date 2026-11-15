import { describe, expect, it } from "vitest";

import { pickSingleParam, sanitizeInviteNextPath } from "./redirect";

describe("sanitizeInviteNextPath", () => {
  it("accepts relative invite paths", () => {
    expect(sanitizeInviteNextPath("/invite/abc_123-XYZ")).toBe("/invite/abc_123-XYZ");
    expect(sanitizeInviteNextPath("  /invite/token  ")).toBe("/invite/token");
  });

  it("rejects open redirects, non-invite paths, and non-strings", () => {
    expect(sanitizeInviteNextPath("//evil.example/invite/a")).toBeNull();
    expect(sanitizeInviteNextPath("https://evil.example/invite/a")).toBeNull();
    expect(sanitizeInviteNextPath("/invite\\bad")).toBeNull();
    expect(sanitizeInviteNextPath("/dashboard")).toBeNull();
    expect(sanitizeInviteNextPath("/")).toBeNull();
    expect(sanitizeInviteNextPath("")).toBeNull();
    expect(sanitizeInviteNextPath(null)).toBeNull();
    expect(sanitizeInviteNextPath(123)).toBeNull();
  });
});

describe("pickSingleParam", () => {
  it("picks single string values cleanly", () => {
    expect(pickSingleParam("/invite/abc")).toBe("/invite/abc");
    expect(pickSingleParam(["/invite/first", "/invite/second"])).toBe("/invite/first");
    expect(pickSingleParam(undefined)).toBeNull();
  });
});
