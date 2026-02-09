import type { Chapter, CreateProjectInput, Project, SpeakerProfile } from "../../shared/types.js";
import { chunkTextToSegments } from "./chunking.js";
import { createId } from "../utils/id.js";
import { nowIso } from "../utils/time.js";

function ensureSpeakers(inputSpeakers: SpeakerProfile[]): SpeakerProfile[] {
  if (inputSpeakers.length > 0) {
    return inputSpeakers.slice(0, 6);
  }
  return [
    {
      id: createId(),
      name: "Narrator",
      ttsModel: "kokoro",
      voiceId: "af_heart"
    }
  ];
}

export function buildProject(input: CreateProjectInput): Project {
  const createdAt = nowIso();
  const speakers = ensureSpeakers(input.speakers);
  const defaultSpeaker = speakers[0];
  if (!defaultSpeaker) {
    throw new Error("No speaker available for project creation");
  }

  const chapters: Chapter[] = input.chapters.map((chapter, chapterIndex) => {
    const chapterId = createId();
    const segments = chunkTextToSegments(chapter.text, {
      chapterId,
      speakerId: defaultSpeaker.id,
      maxChars: 320,
      startOrder: 0
    });

    return {
      id: chapterId,
      title: chapter.title || `Chapter ${chapterIndex + 1}`,
      order: chapterIndex,
      segments
    };
  });

  return {
    id: createId(),
    title: input.title,
    sourcePath: input.sourcePath,
    sourceFormat: input.sourceFormat,
    createdAt,
    updatedAt: createdAt,
    chapters,
    speakers,
    settings: {
      speed: input.settings?.speed ?? 1,
      outputSampleRate: input.settings?.outputSampleRate ?? 24000,
      llmPrepEnabledByDefault: input.settings?.llmPrepEnabledByDefault ?? false
    }
  };
}
