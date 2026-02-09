import type { Segment } from "../../shared/types.js";
import { splitIntoSentences } from "./textUtils.js";
import { createId } from "../utils/id.js";

export interface ChunkOptions {
  chapterId: string;
  speakerId: string;
  maxChars: number;
  startOrder: number;
}

export function estimateSegmentDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.8;
  return Number((words / wordsPerSecond).toFixed(2));
}

export function chunkTextToSegments(text: string, options: ChunkOptions): Segment[] {
  const sentences = splitIntoSentences(text);
  const segments: Segment[] = [];

  let buffer = "";
  let order = options.startOrder;

  const pushBuffer = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      return;
    }
    segments.push({
      id: createId(),
      chapterId: options.chapterId,
      order,
      speakerId: options.speakerId,
      text: trimmed,
      expressionTags: [],
      estDurationSec: estimateSegmentDurationSec(trimmed)
    });
    order += 1;
    buffer = "";
  };

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
      continue;
    }
    if ((buffer.length + sentence.length + 1) <= options.maxChars) {
      buffer = `${buffer} ${sentence}`;
    } else {
      pushBuffer();
      buffer = sentence;
    }
  }

  pushBuffer();

  if (segments.length === 0) {
    segments.push({
      id: createId(),
      chapterId: options.chapterId,
      order: options.startOrder,
      speakerId: options.speakerId,
      text,
      expressionTags: [],
      estDurationSec: estimateSegmentDurationSec(text)
    });
  }

  return segments;
}
