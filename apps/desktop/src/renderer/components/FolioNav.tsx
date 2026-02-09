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
      <div className="toolbar">
        <div className="toolbar-brand">
          <div>
            <p className="brand-kicker">Nordic Frost</p>
            <h1>Folio</h1>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="icon-btn" onClick={onOpenSettings} title="Settings">
            {"\u{2699}\u{FE0F}"}
          </button>
        </div>
      </div>

      <nav className="stage-tabs">
        {views.map((item) => (
          <button
            key={item.id}
            className={`stage-tab ${view === item.id ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
