import type { BootstrapStatus, KokoroBackendMode } from "../../shared/types";
import { HisuiButton } from "./HisuiButton";

interface RuntimeSetupPanelProps {
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
  mode?: "onboarding" | "settings";
}

export function RuntimeSetupPanel({
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
  onStart,
  mode = "onboarding"
}: RuntimeSetupPanelProps) {
  const phase = status?.phase ?? "running";
  const bridgeUnavailable = Boolean(status?.error?.toLowerCase().includes("desktop bridge unavailable"));
  const canStart = phase !== "running" && !bridgeUnavailable;
  const canEditInstallPath = phase !== "running";
  const canPickInstallPath = canEditInstallPath && !bridgeUnavailable;
  const packList = status?.modelPacks ?? [];
  const trimmedDefaultPath = defaultInstallPath.trim();
  const usesDefaultPath = trimmedDefaultPath.length > 0 && installPath.trim() === trimmedDefaultPath;
  const startLabel = status?.firstRun
    ? "Install & Start"
    : phase === "ready"
      ? "Apply Runtime Changes"
      : "Start Services";

  return (
    <section className={mode === "onboarding" ? "setup-config" : "runtime-setup-panel"}>
      <div className="setup-config-header">
        <p className="eyebrow">Runtime Setup</p>
        <h2>{titleForPhase(phase)}</h2>
      </div>

      <div className="setup-fields">
        <label className="setup-field">
          <span className="setup-field-label">Install Path</span>
          <input
            value={installPath}
            disabled={!canEditInstallPath}
            onChange={(event) => onInstallPathChange(event.target.value)}
            placeholder="/Users/you/Library/Application Support/Hisui/offline-runtime"
          />
          <div className="setup-install-actions">
            <HisuiButton
              variant="browse"
              size="sm"
              onClick={onBrowseInstallPath}
              disabled={!canPickInstallPath}
            >
              Browse
            </HisuiButton>
            <HisuiButton
              variant="ghost"
              size="sm"
              onClick={onUseDefaultInstallPath}
              disabled={!canEditInstallPath || trimmedDefaultPath.length === 0 || usesDefaultPath}
            >
              Use Default
            </HisuiButton>
          </div>
          {trimmedDefaultPath ? (
            <p className="setup-default-path">
              Default path: <code>{trimmedDefaultPath}</code>
            </p>
          ) : null}
        </label>

        <label className="setup-field">
          <span className="setup-field-label">Kokoro Backend</span>
          <select
            value={kokoroBackend}
            disabled={phase === "running"}
            onChange={(event) => onBackendChange(event.target.value as KokoroBackendMode)}
          >
            <option value="auto">Auto (recommended)</option>
            <option value="node-first">Node first</option>
            <option value="node-fallback">Node fallback</option>
            <option value="node">Node only</option>
          </select>
        </label>
      </div>

      <div className="setup-packs">
        <div className="setup-packs-header">
          <h3>Model Packs</h3>
          <p>Select packs to install before startup.</p>
        </div>

        <div className="setup-pack-grid">
          {packList.map((pack) => {
            const checked = selectedPackIds.includes(pack.id) || pack.required;
            return (
              <article key={pack.id} className={`pack-card pack-card--${pack.state}`}>
                <label className="pack-card-main">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={phase === "running" || pack.required}
                    onChange={() => onTogglePack(pack.id)}
                  />
                  <div className="pack-card-info">
                    <h4>{pack.title}</h4>
                    <p>{pack.description}</p>
                  </div>
                </label>

                <div className="pack-card-meta">
                  <span className="pack-chip">{pack.required ? "Required" : "Optional"}</span>
                  <span className="pack-chip">{pack.source === "remote" ? "Download" : "Bundled"}</span>
                  <span className="pack-chip">{formatBytes(pack.sizeBytes)}</span>
                </div>

                {pack.state === "downloading" || pack.state === "extracting" ? (
                  <div className="pack-progress">
                    <div className="progress-track" role="progressbar" aria-valuenow={pack.percent} aria-valuemin={0} aria-valuemax={100}>
                      <div className="progress-fill" style={{ width: `${pack.percent}%` }} />
                    </div>
                    <p className="progress-meta">
                      {pack.state === "extracting"
                        ? "Extracting archive..."
                        : `${formatBytes(pack.downloadedBytes)} of ${formatBytes(pack.totalBytes || pack.sizeBytes)}`}
                    </p>
                  </div>
                ) : null}

                {pack.state === "installed" ? (
                  <p className="status-line">Installed</p>
                ) : null}

                {pack.error ? (
                  <p className="error-text">{pack.error}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      {status?.error ? (
        <div className="alert alert-error">
          <span className="alert-icon" aria-hidden="true">!</span>
          <p>{status.error}</p>
        </div>
      ) : null}

      <div className="setup-action">
        <HisuiButton variant="primary" size="lg" onClick={onStart} disabled={!canStart || !installPath.trim()}>
          {startLabel}
        </HisuiButton>
      </div>
    </section>
  );
}

function titleForPhase(phase: BootstrapStatus["phase"]): string {
  if (phase === "awaiting-input") return "Configure Runtime";
  if (phase === "running") return "Installing";
  if (phase === "error") return "Retry Setup";
  return "Runtime Ready";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
