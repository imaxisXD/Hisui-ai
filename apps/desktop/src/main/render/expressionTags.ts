import type { TagValidationResult } from "../../shared/types.js";

export const SUPPORTED_TAGS = [
  "laughs",
  "sighs",
  "chuckles",
  "breathes",
  "whispers"
];

export function extractExpressionTags(text: string): string[] {
  const matches = text.match(/\[([^\]]+)\]/g) ?? [];
  return matches
    .map((match) => match.slice(1, -1).trim().toLowerCase())
    .filter(Boolean);
}

export function validateExpressionTags(text: string): TagValidationResult {
  const tags = extractExpressionTags(text);
  const invalidTags = tags.filter((tag) => !SUPPORTED_TAGS.includes(tag));
  return {
    isValid: invalidTags.length === 0,
    invalidTags,
    supportedTags: SUPPORTED_TAGS
  };
}
