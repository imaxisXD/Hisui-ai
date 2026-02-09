import { useEffect } from "react";
import { useTheme, type ThemeName } from "./ThemeContext";
import { HisuiButton } from "./HisuiButton";

interface SettingsPanelProps {
  onClose(): void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <HisuiButton variant="ghost" size="sm" onClick={onClose}>Close</HisuiButton>
        </div>

        <div className="settings-section">
          <h3>Theme</h3>
          <div className="theme-picker">
            <ThemeCard
              name="hisui"
              label="Hisui"
              description="Dark broadcast studio"
              selected={theme === "hisui"}
              onSelect={setTheme}
            />
            <ThemeCard
              name="folio"
              label="Folio"
              description="Light editorial workspace"
              selected={theme === "folio"}
              onSelect={setTheme}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  name,
  label,
  description,
  selected,
  onSelect
}: {
  name: ThemeName;
  label: string;
  description: string;
  selected: boolean;
  onSelect: (theme: ThemeName) => void;
}) {
  return (
    <button
      className={`theme-card ${selected ? "theme-card--selected" : ""}`}
      onClick={() => onSelect(name)}
    >
      <div className={`theme-preview theme-preview-${name}`}>
        {name === "hisui" ? (
          <>
            <div className="preview-sidebar" />
            <div className="preview-content">
              <div className="preview-accent" />
              <div className="preview-line" />
              <div className="preview-line" />
              <div className="preview-line" />
            </div>
          </>
        ) : (
          <>
            <div className="preview-toolbar" />
            <div className="preview-content">
              <div className="preview-accent" />
              <div className="preview-line" />
              <div className="preview-line" />
              <div className="preview-line" />
            </div>
          </>
        )}
      </div>
      <h4>{label}</h4>
      <p>{description}</p>
    </button>
  );
}
