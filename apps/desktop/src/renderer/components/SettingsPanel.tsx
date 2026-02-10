import { useEffect } from "react";
import type {
  BootstrapStatus,
  DiagnosticsSnapshot,
  ProjectHistoryItem,
  RuntimeResourceSettings,
  UpdateRuntimeResourceSettingsInput,
  UpdateState,
  KokoroBackendMode
} from "../../shared/types";
import { useTheme, type ThemeName } from "./ThemeContext";
import { HisuiButton } from "./HisuiButton";
import { RuntimeSetupPanel } from "./RuntimeSetupPanel";

interface SettingsPanelProps {
  onClose(): void;
  updateState: UpdateState | null;
  diagnostics: DiagnosticsSnapshot | null;
  updateActionError: string | null;
  diagnosticsError: string | null;
  updateActionPending: boolean;
  diagnosticsPending: boolean;
  runtimeResourceSettings: RuntimeResourceSettings | null;
  runtimeResourceDraft: UpdateRuntimeResourceSettingsInput;
  runtimeResourceDirty: boolean;
  runtimeResourceSavePending: boolean;
  runtimeResourceSaveError: string | null;
  runtimeResourceSaveSuccess: boolean;
  onRuntimeStrictWakeOnlyChange(value: boolean): void;
  onRuntimeIdleStopMinutesChange(minutes: number): void;
  onSaveRuntimeResourceSettings(): Promise<void>;
  onCheckForUpdates(): Promise<void>;
  onInstallDownloadedUpdate(): Promise<void>;
  onRefreshDiagnostics(): Promise<void>;
  onRevealCrashDumps(): Promise<void>;
  projectHistory?: ProjectHistoryItem[];
  projectHistoryLoading?: boolean;
  projectHistoryError?: string | null;
  onOpenProjectFromHistory?: (projectId: string) => Promise<void>;
  bootstrapStatus?: BootstrapStatus | null;
  bootstrapAutoStartEnabled?: boolean;
  bootstrapDefaultInstallPath?: string;
  bootstrapInstallPath?: string;
  bootstrapBackend?: KokoroBackendMode;
  bootstrapSelectedPackIds?: string[];
  onBootstrapInstallPathChange?: (value: string) => void;
  onBootstrapBrowseInstallPath?: () => Promise<string | null>;
  onBootstrapUseDefaultInstallPath?: () => void;
  onBootstrapBackendChange?: (value: KokoroBackendMode) => void;
  onBootstrapTogglePack?: (packId: string) => void;
  onBootstrapAutoStartEnabledChange?: (value: boolean) => Promise<void>;
  onBootstrapStart?: () => Promise<void>;
}

function updatePhaseLabel(phase: UpdateState["phase"]): string {
  switch (phase) {
    case "idle":
      return "Idle";
    case "checking":
      return "Checking";
    case "available":
      return "Available";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Ready to install";
    case "not-available":
      return "Up to date";
    case "error":
      return "Error";
    case "disabled":
      return "Disabled";
    default:
      return phase;
  }
}

export function SettingsPanel({
  onClose,
  updateState,
  diagnostics,
  updateActionError,
  diagnosticsError,
  updateActionPending,
  diagnosticsPending,
  runtimeResourceSettings,
  runtimeResourceDraft,
  runtimeResourceDirty,
  runtimeResourceSavePending,
  runtimeResourceSaveError,
  runtimeResourceSaveSuccess,
  onRuntimeStrictWakeOnlyChange,
  onRuntimeIdleStopMinutesChange,
  onSaveRuntimeResourceSettings,
  onCheckForUpdates,
  onInstallDownloadedUpdate,
  onRefreshDiagnostics,
  onRevealCrashDumps,
  projectHistory = [],
  projectHistoryLoading = false,
  projectHistoryError = null,
  onOpenProjectFromHistory,
  bootstrapStatus = null,
  bootstrapAutoStartEnabled = true,
  bootstrapDefaultInstallPath = "",
  bootstrapInstallPath = "",
  bootstrapBackend = "auto",
  bootstrapSelectedPackIds = [],
  onBootstrapInstallPathChange,
  onBootstrapBrowseInstallPath,
  onBootstrapUseDefaultInstallPath,
  onBootstrapBackendChange,
  onBootstrapTogglePack,
  onBootstrapAutoStartEnabledChange,
  onBootstrapStart
}: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const runtimeSettingsLoading = runtimeResourceSettings === null;
  const idleTimeoutOptions = Array.from({ length: 30 }, (_, index) => index + 1);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const canInstallUpdate = updateState?.phase === "downloaded";
  const phaseText = updateState ? updatePhaseLabel(updateState.phase) : "Unavailable";
  const canRenderBootstrapSettings = Boolean(
    onBootstrapInstallPathChange
    && onBootstrapBrowseInstallPath
    && onBootstrapUseDefaultInstallPath
    && onBootstrapBackendChange
    && onBootstrapTogglePack
    && onBootstrapStart
  );

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal settings-modal--wide" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
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

        <div className="settings-section">
          <h3>Projects + Runtime</h3>
          <div className="settings-project-list">
            {projectHistoryLoading ? <p className="settings-subtle">Loading recent projects...</p> : null}
            {projectHistoryError ? <p className="warning-text" role="alert">{projectHistoryError}</p> : null}
            {projectHistory.length === 0 && !projectHistoryLoading ? (
              <p className="settings-subtle">No projects yet.</p>
            ) : (
              projectHistory.slice(0, 6).map((project) => (
                <div key={project.id} className="settings-project-item">
                  <div>
                    <strong>{project.title}</strong>
                    <p className="settings-subtle">{project.chapterCount} chapters - updated {new Date(project.updatedAt).toLocaleDateString()}</p>
                  </div>
                  <HisuiButton
                    variant="ghost"
                    size="sm"
                    onClick={() => void onOpenProjectFromHistory?.(project.id)}
                    disabled={!onOpenProjectFromHistory}
                  >
                    Open
                  </HisuiButton>
                </div>
              ))
            )}
          </div>

          <label className="settings-runtime-row settings-runtime-row--toggle">
            <span className="settings-runtime-copy">
              <span className="settings-runtime-label">Auto-start runtime on app launch</span>
              <span className="settings-runtime-desc">Skip setup screen for returning users and start services in background.</span>
            </span>
            <span className="render-check-toggle">
              <input
                type="checkbox"
                checked={bootstrapAutoStartEnabled}
                onChange={(event) => {
                  void onBootstrapAutoStartEnabledChange?.(event.target.checked);
                }}
                disabled={!onBootstrapAutoStartEnabledChange || bootstrapStatus?.phase === "running"}
              />
              <span className="render-check-slider" aria-hidden="true" />
            </span>
          </label>

          {canRenderBootstrapSettings ? (
            <RuntimeSetupPanel
              mode="settings"
              status={bootstrapStatus}
              defaultInstallPath={bootstrapDefaultInstallPath}
              installPath={bootstrapInstallPath}
              kokoroBackend={bootstrapBackend}
              selectedPackIds={bootstrapSelectedPackIds}
              onInstallPathChange={onBootstrapInstallPathChange!}
              onBrowseInstallPath={() => void onBootstrapBrowseInstallPath!()}
              onUseDefaultInstallPath={onBootstrapUseDefaultInstallPath!}
              onBackendChange={onBootstrapBackendChange!}
              onTogglePack={onBootstrapTogglePack!}
              onStart={() => void onBootstrapStart!()}
            />
          ) : null}
        </div>

        <div className="settings-section">
          <h3>Runtime Resources</h3>
          {runtimeResourceSettings?.promptPending ? (
            <div className="settings-prompt-card" role="status">
              <p className="settings-prompt-kicker">Action needed</p>
              <p>
                Local voice runtime is currently in temporary strict mode. Choose your preferred wake policy and save once to keep it.
              </p>
            </div>
          ) : null}
          <p className="settings-subtle">
            Control when local models wake and when idle runtime memory is released.
          </p>
          <label className="settings-runtime-row settings-runtime-row--toggle">
            <span className="settings-runtime-copy">
              <span className="settings-runtime-label">Strict wake policy</span>
              <span className="settings-runtime-desc">Only voice preview and render can wake runtime.</span>
            </span>
            <span className="render-check-toggle">
              <input
                type="checkbox"
                checked={runtimeResourceDraft.strictWakeOnly}
                onChange={(event) => onRuntimeStrictWakeOnlyChange(event.target.checked)}
                disabled={runtimeSettingsLoading || runtimeResourceSavePending}
              />
              <span className="render-check-slider" aria-hidden="true" />
            </span>
          </label>
          <label className="settings-runtime-row">
            <span className="settings-runtime-copy">
              <span className="settings-runtime-label">Idle shutdown timeout</span>
              <span className="settings-runtime-desc">Stop the local runtime after inactivity.</span>
            </span>
            <div className="settings-runtime-timeout">
              <select
                value={runtimeResourceDraft.idleStopMinutes}
                onChange={(event) => onRuntimeIdleStopMinutesChange(Number(event.target.value))}
                disabled={runtimeSettingsLoading || runtimeResourceSavePending}
              >
                {idleTimeoutOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes}</option>
                ))}
              </select>
              <span>minutes</span>
            </div>
          </label>
          <div className="settings-inline-actions settings-inline-actions--runtime">
            <HisuiButton
              variant="primary"
              size="sm"
              loading={runtimeResourceSavePending}
              loadingText="Saving..."
              onClick={() => void onSaveRuntimeResourceSettings()}
              disabled={runtimeSettingsLoading || runtimeResourceSavePending || !runtimeResourceDirty}
            >
              Save Runtime Settings
            </HisuiButton>
            <p className="settings-save-state" role="status" aria-live="polite">
              {runtimeSettingsLoading ? "Loading settings..." : runtimeResourceSaveSuccess
                ? "Saved."
                : runtimeResourceDirty ? "Unsaved changes." : "No pending changes."}
            </p>
          </div>
          {runtimeResourceSaveError ? <p className="warning-text" role="alert">{runtimeResourceSaveError}</p> : null}
        </div>

        <div className="settings-section">
          <h3>Updates</h3>
          <p className="settings-subtle">
            Version: <code>{updateState?.currentVersion ?? "unknown"}</code>
          </p>
          <p className="settings-subtle">
            Status: <strong>{phaseText}</strong>
          </p>
          {updateState?.availableVersion ? (
            <p className="settings-subtle">
              Available: <code>{updateState.availableVersion}</code>
            </p>
          ) : null}
          {updateState?.downloadPercent !== undefined ? (
            <p className="settings-subtle">Download: {updateState.downloadPercent}%</p>
          ) : null}
          {updateState?.message ? <p className="settings-subtle">{updateState.message}</p> : null}

          <div className="settings-inline-actions">
            <HisuiButton
              variant="primary"
              size="sm"
              loading={updateActionPending}
              loadingText="Working..."
              onClick={() => void onCheckForUpdates()}
              disabled={updateActionPending}
            >
              Check for Updates
            </HisuiButton>
            <HisuiButton
              variant="ghost"
              size="sm"
              loading={updateActionPending}
              loadingText="Installing..."
              onClick={() => void onInstallDownloadedUpdate()}
              disabled={!canInstallUpdate || updateActionPending}
            >
              Install Downloaded Update
            </HisuiButton>
          </div>

          {updateActionError ? <p className="warning-text" role="alert">{updateActionError}</p> : null}
        </div>

        <div className="settings-section">
          <h3>Diagnostics</h3>
          <p className="settings-subtle">Crash dumps: <code>{diagnostics?.crashDumpsPath ?? "unavailable"}</code></p>
          <p className="settings-subtle">Recent dumps: {diagnostics?.recentCrashDumps.length ?? 0}</p>
          <p className="settings-subtle">Processes observed: {diagnostics?.appMetrics.length ?? 0}</p>

          <div className="settings-inline-actions">
            <HisuiButton
              variant="primary"
              size="sm"
              loading={diagnosticsPending}
              loadingText="Refreshing..."
              onClick={() => void onRefreshDiagnostics()}
              disabled={diagnosticsPending}
            >
              Refresh Diagnostics
            </HisuiButton>
            <HisuiButton
              variant="ghost"
              size="sm"
              onClick={() => void onRevealCrashDumps()}
              disabled={!diagnostics?.crashDumpsPath}
            >
              Reveal Crash Dumps
            </HisuiButton>
          </div>

          {diagnosticsError ? <p className="warning-text" role="alert">{diagnosticsError}</p> : null}
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
