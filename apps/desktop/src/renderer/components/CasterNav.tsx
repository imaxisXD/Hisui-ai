import { useState } from "react";

type View = "library" | "script" | "voices" | "render";

interface CasterNavProps {
  view: View;
  onChange(view: View): void;
  projectTitle: string;
  onOpenSettings(): void;
  onLlmPreview?(): void;
}

const stages: Array<{ id: View; label: string; number: string; desc: string }> = [
  { id: "library", label: "Import", number: "01", desc: "Book intake" },
  { id: "script", label: "Script", number: "02", desc: "Edit segments" },
  { id: "voices", label: "Voices", number: "03", desc: "Cast speakers" },
  { id: "render", label: "Render", number: "04", desc: "Export audio" }
];

const stageIndex: Record<View, number> = { library: 0, script: 1, voices: 2, render: 3 };

export function CasterNav({ view, onChange, projectTitle, onOpenSettings, onLlmPreview }: CasterNavProps) {
  const currentIdx = stageIndex[view];

  return (
    <>
      {/* Command Bar — top floating bar */}
      <header className="command-bar">
        <div className="command-bar-left">
          <div className="brand-mark">
            <span className="brand-wordmark">Caster</span>
          </div>
          {projectTitle ? (
            <div className="project-badge">
              <span className="project-badge-icon" aria-hidden="true">&#9670;</span>
              <span className="project-badge-title">{projectTitle}</span>
            </div>
          ) : null}
        </div>

        <div className="command-bar-center">
          <span className="stage-indicator">
            <span className="stage-indicator-num">{stages[currentIdx]?.number}</span>
            <span className="stage-indicator-label">{stages[currentIdx]?.label}</span>
          </span>
        </div>

        <div className="command-bar-right">
          {onLlmPreview && projectTitle ? (
            <button className="cmd-btn" onClick={onLlmPreview} title="Preview LLM Prep">
              <span className="cmd-btn-icon" aria-hidden="true">&#9881;</span>
              <span>LLM Prep</span>
            </button>
          ) : null}
          <button className="cmd-btn cmd-btn-settings" onClick={onOpenSettings} title="Settings" aria-label="Settings">
            <span className="cmd-btn-icon" aria-hidden="true">&#9881;</span>
          </button>
        </div>
      </header>

      {/* Stage Pipeline — bottom anchored */}
      <nav className="stage-pipeline">
        <div className="pipeline-track">
          {stages.map((stage, idx) => {
            const isActive = view === stage.id;
            const isCompleted = idx < currentIdx;
            const isFuture = idx > currentIdx;

            return (
              <button
                key={stage.id}
                className={[
                  "pipeline-stage",
                  isActive && "pipeline-stage--active",
                  isCompleted && "pipeline-stage--done",
                  isFuture && "pipeline-stage--future"
                ].filter(Boolean).join(" ")}
                onClick={() => onChange(stage.id)}
              >
                <span className="pipeline-stage-number">{stage.number}</span>
                <span className="pipeline-stage-content">
                  <span className="pipeline-stage-label">{stage.label}</span>
                  <span className="pipeline-stage-desc">{stage.desc}</span>
                </span>
                {idx < stages.length - 1 ? (
                  <span className={`pipeline-connector ${isCompleted ? "pipeline-connector--done" : ""}`} />
                ) : null}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
