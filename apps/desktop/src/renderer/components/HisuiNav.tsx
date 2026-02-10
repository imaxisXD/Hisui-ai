import { cn } from "../lib/utils";

type View = "library" | "script" | "voices" | "render";

interface HisuiNavProps {
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

const cmdButtonClass = [
  "inline-flex items-center gap-[0.35rem] rounded-[3px] border border-ui-border-strong",
  "bg-transparent px-[0.6rem] py-[0.3rem] font-geist-sans text-[0.78rem] text-ui-text-secondary",
  "transition-[background,color,border-color] duration-150",
  "hover:border-ui-accent-ghost-border hover:bg-ui-bg-hover hover:text-ui-text-primary",
  "enabled:active:[transform:translateY(1px)]"
].join(" ");

export function HisuiNav({ view, onChange, projectTitle, onOpenSettings, onLlmPreview }: HisuiNavProps) {
  const currentIdx = stageIndex[view];

  return (
    <>
      <header className="z-10 flex items-center justify-between border-b border-ui-border bg-ui-bg-secondary px-5 hisui:row-start-1 [-webkit-app-region:drag]">
        <div className="flex flex-1 items-center gap-3 [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-2">
            <span className="font-geist-pixel text-[1.1rem] tracking-[-0.02em] text-ui-text-primary">Hisui</span>
          </div>
          {projectTitle ? (
            <div className="flex items-center gap-[0.4rem] rounded-[3px] border border-ui-accent-ghost-border bg-ui-accent-soft px-[0.6rem] py-[0.2rem] font-geist-mono text-[0.78rem] text-ui-accent">
              <span className="text-[0.6rem] opacity-70" aria-hidden="true">&#9670;</span>
              <span className="truncate max-w-[280px]">{projectTitle}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-baseline gap-[0.35rem] font-geist-mono text-[0.78rem] text-ui-text-secondary max-[640px]:hidden [-webkit-app-region:no-drag]">
          <span className="text-[0.85rem] font-bold text-ui-accent">{stages[currentIdx]?.number}</span>
          <span>{stages[currentIdx]?.label}</span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-3 [-webkit-app-region:no-drag]">
          {onLlmPreview && projectTitle ? (
            <button className={cmdButtonClass} onClick={onLlmPreview} title="Preview LLM Prep">
              <span className="text-[0.85rem] opacity-70" aria-hidden="true">&#9881;</span>
              <span>LLM Prep</span>
            </button>
          ) : null}
          <button
            className={cn(cmdButtonClass, "px-[0.45rem]")}
            onClick={onOpenSettings}
            title="Settings"
            aria-label="Settings"
          >
            <span className="text-[0.85rem] opacity-70" aria-hidden="true">&#9881;</span>
          </button>
        </div>
      </header>

      <nav className="flex items-stretch border-t border-ui-border bg-ui-bg-secondary px-5 hisui:row-start-3">
        <div className="flex w-full gap-0">
          {stages.map((stage, idx) => {
            const isActive = view === stage.id;
            const isCompleted = idx < currentIdx;
            const isFuture = idx > currentIdx;

            return (
              <button
                key={stage.id}
                className={cn(
                  "relative flex flex-1 items-center gap-[0.65rem] border-0 border-t-2 border-t-transparent bg-transparent px-4",
                  "font-geist-sans text-ui-text-muted transition-[color,background,border-color,opacity] duration-200",
                  "hover:bg-ui-bg-hover hover:text-ui-text-secondary",
                  "max-[640px]:px-2",
                  isActive && "border-t-ui-accent bg-ui-accent-soft text-ui-text-primary",
                  isCompleted && "border-t-ui-accent-dim text-ui-text-secondary",
                  isFuture && "opacity-[0.55]"
                )}
                onClick={() => onChange(stage.id)}
              >
                <span
                  className={cn(
                    "min-w-[1.4rem] font-geist-mono text-[0.72rem] font-bold text-ui-text-muted",
                    isActive && "text-ui-accent",
                    isCompleted && "text-ui-accent-dim"
                  )}
                >
                  {stage.number}
                </span>
                <span className="flex flex-col text-left max-[1024px]:gap-0">
                  <span className="text-[0.82rem] font-semibold tracking-[-0.01em] max-[640px]:text-[0.72rem]">{stage.label}</span>
                  <span
                    className={cn(
                      "font-geist-mono text-[0.68rem] text-ui-text-muted max-[1024px]:hidden",
                      isActive && "text-ui-text-secondary"
                    )}
                  >
                    {stage.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
