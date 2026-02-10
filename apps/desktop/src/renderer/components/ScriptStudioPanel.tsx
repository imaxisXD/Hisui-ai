import { useMemo, useState } from "react";
import { cn } from "../lib/utils";
import type { Project, SpeakerProfile } from "../../shared/types";
import { HisuiButton } from "./HisuiButton";

interface ScriptStudioPanelProps {
  project: Project;
  speakers: SpeakerProfile[];
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  onSegmentChange(chapterId: string, segmentId: string, next: { text?: string; speakerId?: string; expressionTags?: string[] }): void;
  onSave(): Promise<void>;
  onValidate(text: string): Promise<void>;
  tagValidationMessage: string | null;
}

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";
const saveIndicatorBaseClass = "inline-flex items-center gap-[0.3rem] rounded-[3px] px-[0.5rem] py-[0.2rem] font-geist-mono text-[0.72rem] uppercase tracking-[0.06em]";
const fieldClass = "w-full rounded border border-ui-border-strong bg-ui-bg-input px-[0.7rem] py-[0.5rem] text-[0.85rem] text-ui-text-primary transition-[border-color,box-shadow] duration-150 focus:border-ui-accent focus:outline-none focus:ring-[3px] focus:ring-ui-accent-soft";

export function ScriptStudioPanel(props: ScriptStudioPanelProps) {
  const [activeChapterId, setActiveChapterId] = useState(props.project.chapters[0]?.id ?? "");

  const activeChapter = useMemo(
    () => props.project.chapters.find((chapter) => chapter.id === activeChapterId) ?? props.project.chapters[0],
    [activeChapterId, props.project.chapters]
  );

  const totalSegments = props.project.chapters.reduce((sum, ch) => sum + ch.segments.length, 0);
  const activeIdx = props.project.chapters.findIndex((ch) => ch.id === activeChapter?.id);

  return (
    <section className="flex h-[calc(100vh-44px-72px-2.5rem)] flex-col rounded-lg border border-ui-border bg-ui-bg-panel shadow-ui-sm animate-[panelReveal_240ms_ease]">
      <div className="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <p className={eyebrowClass}>Stage 02 - Script Studio</p>
          <h2 className="m-0 text-[1.15rem]">{props.project.title}</h2>
          <div className="mt-[0.2rem] flex gap-[0.4rem]">
            <span className="inline-flex rounded-[3px] border border-ui-border bg-ui-bg-surface px-[0.45rem] py-[0.15rem] font-geist-mono text-[0.68rem] text-ui-text-muted">{props.project.chapters.length} chapters</span>
            <span className="inline-flex rounded-[3px] border border-ui-border bg-ui-bg-surface px-[0.45rem] py-[0.15rem] font-geist-mono text-[0.68rem] text-ui-text-muted">{totalSegments} segments</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {props.saveState === "saved" ? (
            <span className={cn(saveIndicatorBaseClass, "bg-ui-success-soft-10 text-ui-success")}>Saved</span>
          ) : null}
          {props.saveError ? (
            <span className={cn(saveIndicatorBaseClass, "bg-ui-error-soft-10 text-ui-error")}>Error</span>
          ) : null}
          <HisuiButton variant="primary" loading={props.saveState === "saving"} loadingText="Saving..." onClick={() => void props.onSave()}>
            Save Edits
          </HisuiButton>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[220px_1fr] max-[1024px]:grid-cols-1">
        <aside className="overflow-y-auto border-r border-ui-border bg-ui-bg-surface p-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden max-[1024px]:max-h-[160px] max-[1024px]:border-b max-[1024px]:border-r-0">
          <p className="mb-2 mt-0 px-1 font-geist-mono text-[0.65rem] uppercase tracking-[0.12em] text-ui-text-muted">Chapters</p>
          <div className="flex flex-col gap-[2px] max-[1024px]:flex-row max-[1024px]:gap-1 max-[1024px]:overflow-x-auto">
            {props.project.chapters.map((chapter, idx) => (
              <button
                key={chapter.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded border border-transparent bg-transparent px-[0.55rem] py-[0.5rem] text-left font-geist-sans text-[0.82rem] text-ui-text-secondary transition-[background,color,border-color] duration-150",
                  "hover:bg-ui-bg-hover hover:text-ui-text-primary",
                  "max-[1024px]:w-auto max-[1024px]:shrink-0 max-[1024px]:whitespace-nowrap",
                  activeChapter?.id === chapter.id && "border-ui-accent-ghost-border bg-ui-accent-soft text-ui-text-primary"
                )}
                onClick={() => setActiveChapterId(chapter.id)}
              >
                <span className={cn(
                  "min-w-[1.4rem] font-geist-mono text-[0.68rem] font-bold text-ui-text-muted",
                  activeChapter?.id === chapter.id && "text-ui-accent"
                )}
                >
                  {String(idx + 1).padStart(2, "0")}
                </span>
                <span className="flex min-w-0 flex-col overflow-hidden">
                  <span className="truncate font-medium">{chapter.title}</span>
                  <span className="font-geist-mono text-[0.65rem] text-ui-text-muted">{chapter.segments.length} seg</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="overflow-y-auto px-5 py-4 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {activeChapter ? (
            <>
              <div className="mb-[0.85rem] flex items-center justify-between">
                <h3 className="m-0 flex items-center gap-2 text-[1rem]">
                  <span className="inline-flex h-[1.6rem] w-[1.6rem] items-center justify-center rounded border border-ui-accent-ghost-border bg-ui-accent-soft font-geist-mono text-[0.65rem] font-bold text-ui-accent">{String(activeIdx + 1).padStart(2, "0")}</span>
                  {activeChapter.title}
                </h3>
                <span className="font-geist-mono text-[0.72rem] text-ui-text-muted">{activeChapter.segments.length} segments</span>
              </div>

              <div className="flex flex-col gap-[0.65rem]">
                {activeChapter.segments.map((segment, sIdx) => (
                  <article key={segment.id} className="flex flex-col gap-[0.55rem] rounded-[5px] border border-ui-border bg-ui-bg-card p-[0.85rem] transition-[border-color] duration-150 focus-within:border-ui-accent-ghost-border">
                    <div className="flex items-center gap-[0.65rem]">
                      <span className="font-geist-mono text-[0.72rem] font-bold text-ui-text-muted">{String(sIdx + 1).padStart(2, "0")}</span>
                      <select
                        className={cn(fieldClass, "h-auto w-auto max-w-[180px] px-[0.5rem] py-[0.3rem] text-[0.8rem]")}
                        aria-label="Speaker"
                        value={segment.speakerId}
                        onChange={(event) => props.onSegmentChange(activeChapter.id, segment.id, { speakerId: event.target.value })}
                      >
                        {props.speakers.map((speaker) => (
                          <option value={speaker.id} key={speaker.id}>{speaker.name}</option>
                        ))}
                      </select>
                    </div>

                    <textarea
                      className={cn(fieldClass, "min-h-[100px]")}
                      aria-label="Segment text"
                      value={segment.text}
                      onChange={(event) => props.onSegmentChange(activeChapter.id, segment.id, { text: event.target.value })}
                    />

                    <div className="flex items-center justify-between gap-2">
                      <HisuiButton variant="ghost" size="sm" onClick={() => void props.onValidate(segment.text)}>
                        Validate Tags
                      </HisuiButton>
                      <span className="font-geist-mono text-[0.68rem] text-ui-text-muted">
                        Use [laughs], [sighs], [whispers]
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {props.tagValidationMessage ? (
        <div
          className="fixed bottom-[88px] left-1/2 z-50 -translate-x-1/2 rounded-md border border-ui-accent-ghost-border bg-ui-bg-card px-4 py-2 font-geist-mono text-[0.8rem] text-ui-text-secondary shadow-ui-md animate-[toastIn_300ms_ease]"
          role="status"
          aria-live="polite"
        >
          {props.tagValidationMessage}
        </div>
      ) : null}
    </section>
  );
}
