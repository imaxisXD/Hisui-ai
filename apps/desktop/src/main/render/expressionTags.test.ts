import { describe, expect, it } from "vitest";
import { extractExpressionTags, validateExpressionTags } from "./expressionTags.js";

describe("extractExpressionTags", () => {
  it("extracts lower-cased bracket tags", () => {
    const result = extractExpressionTags("Hello [Laughs] there [sighs]");
    expect(result).toEqual(["laughs", "sighs"]);
  });
});

describe("validateExpressionTags", () => {
  it("passes supported tags", () => {
    const result = validateExpressionTags("A [laughs] then [whispers]");
    expect(result.isValid).toBe(true);
    expect(result.invalidTags).toHaveLength(0);
  });

  it("returns unsupported tags", () => {
    const result = validateExpressionTags("A [screams]");
    expect(result.isValid).toBe(false);
    expect(result.invalidTags).toEqual(["screams"]);
  });
});
