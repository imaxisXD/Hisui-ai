import type { BootstrapStatus, KokoroBackendMode } from "../../shared/types";
import { useTheme } from "./ThemeContext";
import { RuntimeSetupPanel } from "./RuntimeSetupPanel";

interface BootstrapSetupScreenProps {
  status: BootstrapStatus | null;
  defaultInstallPath: string;
  installPath: string;
  kokoroBackend: KokoroBackendMode;
  selectedPackIds: string[];
  onInstallPathChange: (value: string) => void;
  onBrowseInstallPath: () => void;
  onUseDefaultInstallPath: () => void;
  onBackendChange: (value: KokoroBackendMode) => void;
  onTogglePack: (packId: string) => void;
  onStart: () => void;
}

export function BootstrapSetupScreen({
  status,
  defaultInstallPath,
  installPath,
  kokoroBackend,
  selectedPackIds,
  onInstallPathChange,
  onBrowseInstallPath,
  onUseDefaultInstallPath,
  onBackendChange,
  onTogglePack,
  onStart
}: BootstrapSetupScreenProps) {
  const { theme } = useTheme();
  const phase = status?.phase ?? "running";
  const percent = status?.percent ?? 0;
  const appName = theme === "hisui" ? "Hisui" : "Folio";

  return (
    <main className="setup-shell">
      <section className="setup-hero">
        <div className="setup-hero-inner">
          <span className="setup-brand-dot" aria-hidden="true" />
          <h1>{appName}</h1>
          <p className="setup-tagline">
            {status?.firstRun
              ? "First-time setup. Install the core narration runtime to get started."
              : "Starting local services. This takes a moment."}
          </p>
        </div>

        <div className="setup-overall">
          <div className="progress-ring-container">
            <svg className="progress-ring" viewBox="0 0 80 80" role="img" aria-label={`Progress: ${percent}%`}>
              <circle className="progress-ring-bg" cx="40" cy="40" r="34" />
              <circle
                className="progress-ring-fill"
                cx="40"
                cy="40"
                r="34"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - percent / 100)}`}
              />
            </svg>
            <span className="progress-ring-label" aria-hidden="true">{percent}%</span>
          </div>
          <div className="setup-overall-text">
            <strong>{status?.message ?? "Checking runtime..."}</strong>
            <span className="setup-overall-bytes">
              {status?.bytesTotal
                ? `${formatBytes(status.bytesCopied)} / ${formatBytes(status.bytesTotal)}`
                : ""}
            </span>
          </div>
          <span className={`phase-pill phase-${phase}`}>{phaseLabel(phase)}</span>
        </div>
      </section>

      <RuntimeSetupPanel
        mode="onboarding"
        status={status}
        defaultInstallPath={defaultInstallPath}
        installPath={installPath}
        kokoroBackend={kokoroBackend}
        selectedPackIds={selectedPackIds}
        onInstallPathChange={onInstallPathChange}
        onBrowseInstallPath={onBrowseInstallPath}
        onUseDefaultInstallPath={onUseDefaultInstallPath}
        onBackendChange={onBackendChange}
        onTogglePack={onTogglePack}
        onStart={onStart}
      />
    </main>
  );
}

function phaseLabel(phase: BootstrapStatus["phase"]): string {
  if (phase === "awaiting-input") return "Waiting";
  if (phase === "running") return "In Progress";
  if (phase === "error") return "Blocked";
  return "Ready";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
