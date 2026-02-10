import { cn } from "../lib/utils";

type View = "library" | "script" | "voices" | "render";

interface FolioNavProps {
  view: View;
  onChange(view: View): void;
  onOpenSettings(): void;
}

const views: Array<{ id: View; label: string }> = [
  { id: "library", label: "Library" },
  { id: "script", label: "Script Studio" },
  { id: "voices", label: "Voice Casting" },
  { id: "render", label: "Render Desk" }
];

export function FolioNav({ view, onChange, onOpenSettings }: FolioNavProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-ui-border bg-ui-bg-secondary px-6 folio:row-start-1">
        <div>
          <p className="m-0 text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted">Nordic Frost</p>
          <h1 className="m-0">Folio</h1>
        </div>
        <div className="flex items-center">
          <button
            className="rounded border border-ui-border bg-transparent px-2 py-[0.35rem] text-[0.85rem] leading-none text-ui-text-secondary transition-[background,color] duration-150 hover:bg-ui-bg-hover hover:text-ui-text-primary"
            onClick={onOpenSettings}
            title="Settings"
          >
            {"\u{2699}\u{FE0F}"}
          </button>
        </div>
      </div>

      <nav className="flex gap-0 border-b border-ui-border bg-ui-bg-nav px-6 folio:row-start-2">
        {views.map((item) => (
          <button
            key={item.id}
            className={cn(
              "relative border-0 bg-transparent px-[1.2rem] py-[0.6rem] font-geist-sans text-[0.85rem] font-medium text-ui-text-secondary transition-colors duration-150",
              "hover:text-ui-text-primary",
              view === item.id && "font-semibold text-ui-accent after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-ui-accent after:content-['']"
            )}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
