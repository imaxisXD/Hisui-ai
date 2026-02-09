import { useMemo, useState } from "react";
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

export function ScriptStudioPanel(props: ScriptStudioPanelProps) {
  const [activeChapterId, setActiveChapterId] = useState(props.project.chapters[0]?.id ?? "");

  const activeChapter = useMemo(
    () => props.project.chapters.find((chapter) => chapter.id === activeChapterId) ?? props.project.chapters[0],
    [activeChapterId, props.project.chapters]
  );

  const totalSegments = props.project.chapters.reduce((sum, ch) => sum + ch.segments.length, 0);
  const activeIdx = props.project.chapters.findIndex((ch) => ch.id === activeChapter?.id);

  return (
    <section className="panel panel-script">
      {/* Script toolbar */}
      <div className="script-toolbar">
        <div className="script-toolbar-left">
          <p className="eyebrow">Stage 02 &mdash; Script Studio</p>
          <h2>{props.project.title}</h2>
          <div className="script-meta">
            <span className="meta-chip">{props.project.chapters.length} chapters</span>
            <span className="meta-chip">{totalSegments} segments</span>
          </div>
        </div>
        <div className="script-toolbar-right">
          {props.saveState === "saved" ? (
            <span className="save-indicator save-indicator--ok">Saved</span>
          ) : null}
          {props.saveError ? (
            <span className="save-indicator save-indicator--err">Error</span>
          ) : null}
          <HisuiButton variant="primary" loading={props.saveState === "saving"} loadingText="Saving\u2026" onClick={() => void props.onSave()}>
            Save Edits
          </HisuiButton>
        </div>
      </div>

      <div className="script-layout">
        {/* Chapter sidebar */}
        <aside className="chapter-rail">
          <p className="chapter-rail-title">Chapters</p>
          <div className="chapter-list">
            {props.project.chapters.map((chapter, idx) => (
              <button
                key={chapter.id}
                className={`chapter-item ${activeChapter?.id === chapter.id ? "chapter-item--active" : ""}`}
                onClick={() => setActiveChapterId(chapter.id)}
              >
                <span className="chapter-num">{String(idx + 1).padStart(2, "0")}</span>
                <span className="chapter-info">
                  <span className="chapter-title">{chapter.title}</span>
                  <span className="chapter-count">{chapter.segments.length} seg</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Segment editor */}
        <div className="segment-editor">
          {activeChapter ? (
            <>
              <div className="segment-editor-header">
                <h3>
                  <span className="chapter-badge">{String(activeIdx + 1).padStart(2, "0")}</span>
                  {activeChapter.title}
                </h3>
                <span className="segment-counter">{activeChapter.segments.length} segments</span>
              </div>

              <div className="segment-grid">
                {activeChapter.segments.map((segment, sIdx) => (
                  <article key={segment.id} className="segment-card">
                    <div className="segment-card-top">
                      <span className="segment-order">{String(sIdx + 1).padStart(2, "0")}</span>
                      <select
                        className="segment-speaker-select"
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
                      className="segment-textarea"
                      aria-label="Segment text"
                      value={segment.text}
                      onChange={(event) => props.onSegmentChange(activeChapter.id, segment.id, { text: event.target.value })}
                    />

                    <div className="segment-card-bottom">
                      <HisuiButton variant="ghost" size="sm" onClick={() => void props.onValidate(segment.text)}>
                        Validate Tags
                      </HisuiButton>
                      <span className="segment-hint">
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
        <div className="toast toast-info" role="status" aria-live="polite">{props.tagValidationMessage}</div>
      ) : null}
    </section>
  );
}
