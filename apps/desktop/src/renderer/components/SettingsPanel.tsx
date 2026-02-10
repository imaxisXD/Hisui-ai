import { useEffect } from "react";
import { cn } from "../lib/utils";
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

const subtleClass = "my-[0.2rem] text-[0.78rem] text-ui-text-secondary";
const warningTextClass = "text-[0.82rem] text-ui-warning";
const sectionTitleClass = "mb-[0.6rem] mt-0 font-geist-mono text-[0.75rem] uppercase tracking-[0.1em] text-ui-text-muted";

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
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ui-overlay-backdrop backdrop-blur-[4px] animate-[fadeIn_180ms_ease]" onClick={onClose}>
      <div
        className="w-[min(760px,94vw)] max-h-[80vh] overflow-auto overscroll-contain rounded-lg border border-ui-border bg-ui-bg-panel p-6 shadow-ui-md animate-[modalIn_300ms_cubic-bezier(0.16,1,0.3,1)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="m-0 text-[1.15rem]">Settings</h2>
          <HisuiButton variant="ghost" size="sm" onClick={onClose}>Close</HisuiButton>
        </div>

        <div className="mb-4">
          <h3 className={sectionTitleClass}>Theme</h3>
          <div className="grid grid-cols-2 gap-[0.65rem]">
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

        <div className="mb-4">
          <h3 className={sectionTitleClass}>Projects + Runtime</h3>
          <div className="mb-3 flex flex-col gap-2">
            {projectHistoryLoading ? <p className={subtleClass}>Loading recent projects...</p> : null}
            {projectHistoryError ? <p className={warningTextClass} role="alert">{projectHistoryError}</p> : null}
            {projectHistory.length === 0 && !projectHistoryLoading ? (
              <p className={subtleClass}>No projects yet.</p>
            ) : (
              projectHistory.slice(0, 6).map((project) => (
                <div key={project.id} className="flex items-center justify-between gap-2 rounded-md border border-ui-border bg-ui-bg-card px-[0.55rem] py-[0.45rem]">
                  <div>
                    <strong>{project.title}</strong>
                    <p className={subtleClass}>{project.chapterCount} chapters - updated {new Date(project.updatedAt).toLocaleDateString()}</p>
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

          <label className="mb-[0.55rem] flex items-center justify-between gap-3 rounded-md border border-ui-border bg-ui-bg-card px-3 py-[0.65rem] max-[640px]:items-start max-[640px]:flex-col">
            <span className="flex flex-col gap-[0.12rem]">
              <span className="text-[0.82rem] font-semibold text-ui-text-primary">Auto-start runtime on app launch</span>
              <span className="text-[0.72rem] text-ui-text-secondary">Skip setup screen for returning users and start services in background.</span>
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0">
              <input
                className="peer absolute h-0 w-0 opacity-0"
                type="checkbox"
                checked={bootstrapAutoStartEnabled}
                onChange={(event) => {
                  void onBootstrapAutoStartEnabledChange?.(event.target.checked);
                }}
                disabled={!onBootstrapAutoStartEnabledChange || bootstrapStatus?.phase === "running"}
              />
              <span className="absolute inset-0 rounded-[10px] border border-ui-border-strong bg-ui-bg-surface transition-[background,border-color] duration-200 after:absolute after:left-[2px] after:top-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-ui-text-muted after:transition-[transform,background] after:duration-200 peer-checked:border-ui-accent-ghost-border peer-checked:bg-ui-accent-soft peer-checked:after:translate-x-4 peer-checked:after:bg-ui-accent" aria-hidden="true" />
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

        <div className="mb-4">
          <h3 className={sectionTitleClass}>Runtime Resources</h3>
          {runtimeResourceSettings?.promptPending ? (
            <div className="mb-3 rounded-md border border-ui-accent-ghost-border bg-ui-accent-soft px-[0.8rem] py-[0.7rem]" role="status">
              <p className="mb-[0.3rem] text-[0.62rem] font-geist-mono uppercase tracking-[0.12em] text-ui-accent">Action needed</p>
              <p className="m-0">
                Local voice runtime is currently in temporary strict mode. Choose your preferred wake policy and save once to keep it.
              </p>
            </div>
          ) : null}
          <p className={subtleClass}>
            Control when local models wake and when idle runtime memory is released.
          </p>
          <label className="mb-[0.55rem] flex items-center justify-between gap-3 rounded-md border border-ui-border bg-ui-bg-card px-3 py-[0.65rem] max-[640px]:items-start max-[640px]:flex-col">
            <span className="flex flex-col gap-[0.12rem]">
              <span className="text-[0.82rem] font-semibold text-ui-text-primary">Strict wake policy</span>
              <span className="text-[0.72rem] text-ui-text-secondary">Only voice preview and render can wake runtime.</span>
            </span>
            <span className="relative inline-flex h-5 w-9 shrink-0">
              <input
                className="peer absolute h-0 w-0 opacity-0"
                type="checkbox"
                checked={runtimeResourceDraft.strictWakeOnly}
                onChange={(event) => onRuntimeStrictWakeOnlyChange(event.target.checked)}
                disabled={runtimeSettingsLoading || runtimeResourceSavePending}
              />
              <span className="absolute inset-0 rounded-[10px] border border-ui-border-strong bg-ui-bg-surface transition-[background,border-color] duration-200 after:absolute after:left-[2px] after:top-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-ui-text-muted after:transition-[transform,background] after:duration-200 peer-checked:border-ui-accent-ghost-border peer-checked:bg-ui-accent-soft peer-checked:after:translate-x-4 peer-checked:after:bg-ui-accent" aria-hidden="true" />
            </span>
          </label>
          <label className="mb-[0.55rem] flex items-center justify-between gap-3 rounded-md border border-ui-border bg-ui-bg-card px-3 py-[0.65rem] max-[640px]:items-start max-[640px]:flex-col">
            <span className="flex flex-col gap-[0.12rem]">
              <span className="text-[0.82rem] font-semibold text-ui-text-primary">Idle shutdown timeout</span>
              <span className="text-[0.72rem] text-ui-text-secondary">Stop the local runtime after inactivity.</span>
            </span>
            <div className="flex items-center gap-2">
              <select
                className="min-w-[72px] rounded border border-ui-border bg-ui-bg-input px-[0.45rem] py-[0.3rem] text-ui-text-primary"
                value={runtimeResourceDraft.idleStopMinutes}
                onChange={(event) => onRuntimeIdleStopMinutesChange(Number(event.target.value))}
                disabled={runtimeSettingsLoading || runtimeResourceSavePending}
              >
                {idleTimeoutOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes}</option>
                ))}
              </select>
              <span className="text-[0.72rem] text-ui-text-secondary">minutes</span>
            </div>
          </label>
          <div className="mt-[0.65rem] flex flex-wrap items-center justify-between gap-2 max-[640px]:items-start">
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
            <p className="m-0 font-geist-mono text-[0.72rem] text-ui-text-secondary" role="status" aria-live="polite">
              {runtimeSettingsLoading ? "Loading settings..." : runtimeResourceSaveSuccess
                ? "Saved."
                : runtimeResourceDirty ? "Unsaved changes." : "No pending changes."}
            </p>
          </div>
          {runtimeResourceSaveError ? <p className={warningTextClass} role="alert">{runtimeResourceSaveError}</p> : null}
        </div>

        <div className="mb-4">
          <h3 className={sectionTitleClass}>Updates</h3>
          <p className={subtleClass}>
            Version: <code>{updateState?.currentVersion ?? "unknown"}</code>
          </p>
          <p className={subtleClass}>
            Status: <strong>{phaseText}</strong>
          </p>
          {updateState?.availableVersion ? (
            <p className={subtleClass}>
              Available: <code>{updateState.availableVersion}</code>
            </p>
          ) : null}
          {updateState?.downloadPercent !== undefined ? (
            <p className={subtleClass}>Download: {updateState.downloadPercent}%</p>
          ) : null}
          {updateState?.message ? <p className={subtleClass}>{updateState.message}</p> : null}

          <div className="mt-[0.65rem] flex flex-wrap items-center gap-2">
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

          {updateActionError ? <p className={warningTextClass} role="alert">{updateActionError}</p> : null}
        </div>

        <div className="mb-4">
          <h3 className={sectionTitleClass}>Diagnostics</h3>
          <p className={subtleClass}>Crash dumps: <code>{diagnostics?.crashDumpsPath ?? "unavailable"}</code></p>
          <p className={subtleClass}>Recent dumps: {diagnostics?.recentCrashDumps.length ?? 0}</p>
          <p className={subtleClass}>Processes observed: {diagnostics?.appMetrics.length ?? 0}</p>

          <div className="mt-[0.65rem] flex flex-wrap items-center gap-2">
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

          {diagnosticsError ? <p className={warningTextClass} role="alert">{diagnosticsError}</p> : null}
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
  const isHisui = name === "hisui";

  return (
    <button
      className={cn(
        "rounded-md border-2 bg-ui-bg-card p-[0.85rem] text-center transition-[border-color] duration-150",
        "hover:border-ui-border-strong",
        selected ? "border-ui-accent" : "border-ui-border"
      )}
      onClick={() => onSelect(name)}
    >
      <div
        className={cn(
          "mb-2 grid h-[72px] overflow-hidden rounded border border-ui-border",
          isHisui ? "grid-cols-[36px_1fr] bg-ui-preview-hisui-bg" : "grid-cols-1 grid-rows-[10px_1fr] bg-ui-preview-folio-bg"
        )}
      >
        {isHisui ? (
          <>
            <div className="border-r border-r-ui-frost-track bg-ui-preview-hisui-surface" />
            <div className="p-2">
              <div className="mb-[3px] h-[3px] w-1/2 rounded-[1px] bg-ui-preview-hisui-accent" />
              <div className="mb-[3px] h-[3px] rounded-[1px] bg-ui-frost-track" />
              <div className="mb-[3px] h-[3px] rounded-[1px] bg-ui-frost-track" />
              <div className="h-[3px] rounded-[1px] bg-ui-frost-track" />
            </div>
          </>
        ) : (
          <>
            <div className="border-b border-b-ui-preview-folio-line bg-ui-preview-folio-surface" />
            <div className="p-2">
              <div className="mb-[3px] h-[3px] w-1/2 rounded-[1px] bg-ui-preview-folio-accent" />
              <div className="mb-[3px] h-[3px] rounded-[1px] bg-ui-preview-folio-line" />
              <div className="mb-[3px] h-[3px] rounded-[1px] bg-ui-preview-folio-line" />
              <div className="h-[3px] rounded-[1px] bg-ui-preview-folio-line" />
            </div>
          </>
        )}
      </div>
      <h4 className="m-0 text-[0.88rem] font-semibold">{label}</h4>
      <p className="mt-[0.15rem] text-[0.72rem] text-ui-text-secondary">{description}</p>
    </button>
  );
}
