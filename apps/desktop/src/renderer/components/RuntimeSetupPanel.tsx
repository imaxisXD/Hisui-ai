import { cn } from "../lib/utils";
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

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";
const fieldLabelClass = "font-geist-mono text-[0.65rem] uppercase tracking-[0.1em] text-ui-text-muted";
const fieldClass = "w-full rounded border border-ui-border-strong bg-ui-bg-input px-[0.7rem] py-[0.5rem] text-[0.85rem] text-ui-text-primary transition-[border-color,box-shadow] duration-150 focus:border-ui-accent focus:outline-none focus:ring-[3px] focus:ring-ui-accent-soft";

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
    <section
      className={cn(
        "flex flex-col gap-5",
        mode === "onboarding"
          ? "rounded-lg border border-ui-border bg-ui-bg-panel p-6 animate-[staggerReveal_600ms_cubic-bezier(0.16,1,0.3,1)] [animation-delay:80ms] [animation-fill-mode:both]"
          : "mt-3 border-t border-ui-border pt-3"
      )}
    >
      <div className="flex flex-col gap-1">
        <p className={eyebrowClass}>Runtime Setup</p>
        <h2 className={cn("m-0", mode === "settings" ? "text-[1rem]" : "text-[1.15rem]")}>{titleForPhase(phase)}</h2>
      </div>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Install Path</span>
          <input
            className={cn(fieldClass, mode === "settings" && "min-h-9")}
            value={installPath}
            disabled={!canEditInstallPath}
            onChange={(event) => onInstallPathChange(event.target.value)}
            placeholder="/Users/you/Library/Application Support/Hisui/offline-runtime"
          />
          <div className="flex flex-wrap gap-2">
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
            <p className="m-0 break-words font-geist-mono text-[0.68rem] leading-[1.45] text-ui-text-muted">
              Default path: <code>{trimmedDefaultPath}</code>
            </p>
          ) : null}
        </label>

        <label className="flex flex-col gap-1">
          <span className={fieldLabelClass}>Kokoro Backend</span>
          <select
            className={cn(fieldClass, mode === "settings" && "min-h-9")}
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

      <div className="flex flex-col gap-[0.65rem]">
        <div>
          <h3 className="m-0 text-[0.95rem]">Model Packs</h3>
          <p className="mt-[0.15rem] text-[0.82rem] text-ui-text-secondary">Select packs to install before startup.</p>
        </div>

        <div className="flex flex-col gap-2">
          {packList.map((pack) => {
            const checked = selectedPackIds.includes(pack.id) || pack.required;
            return (
              <article key={pack.id} className="flex flex-col gap-[0.45rem] rounded-[5px] border border-ui-border bg-ui-bg-card p-[0.85rem]">
                <label className="flex cursor-pointer items-start gap-[0.6rem]">
                  <input
                    className="mt-[3px] w-auto accent-ui-accent"
                    type="checkbox"
                    checked={checked}
                    disabled={phase === "running" || pack.required}
                    onChange={() => onTogglePack(pack.id)}
                  />
                  <div>
                    <h4 className="m-0 font-geist-sans text-[0.88rem] font-semibold">{pack.title}</h4>
                    <p className="mt-[0.1rem] text-[0.78rem] text-ui-text-secondary">{pack.description}</p>
                  </div>
                </label>

                <div className="ml-[1.35rem] flex flex-wrap gap-[0.3rem]">
                  <span className="rounded-[2px] border border-ui-chip-border bg-ui-chip-bg px-[0.35rem] py-[0.1rem] font-geist-mono text-[0.62rem] uppercase tracking-[0.06em] text-ui-accent">{pack.required ? "Required" : "Optional"}</span>
                  <span className="rounded-[2px] border border-ui-chip-border bg-ui-chip-bg px-[0.35rem] py-[0.1rem] font-geist-mono text-[0.62rem] uppercase tracking-[0.06em] text-ui-accent">{pack.source === "remote" ? "Download" : "Bundled"}</span>
                  <span className="rounded-[2px] border border-ui-chip-border bg-ui-chip-bg px-[0.35rem] py-[0.1rem] font-geist-mono text-[0.62rem] uppercase tracking-[0.06em] text-ui-accent">{formatBytes(pack.sizeBytes)}</span>
                </div>

                {pack.state === "downloading" || pack.state === "extracting" ? (
                  <div className="ml-[1.35rem] flex flex-col gap-[0.3rem]">
                    <div className="h-[6px] w-full overflow-hidden rounded-[3px] border border-ui-border bg-ui-bg-input" role="progressbar" aria-valuenow={pack.percent} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-[3px] bg-ui-progress transition-[width] duration-250" style={{ width: `${pack.percent}%` }} />
                    </div>
                    <p className="m-0 font-geist-mono text-[0.72rem] text-ui-text-muted">
                      {pack.state === "extracting"
                        ? "Extracting archive..."
                        : `${formatBytes(pack.downloadedBytes)} of ${formatBytes(pack.totalBytes || pack.sizeBytes)}`}
                    </p>
                  </div>
                ) : null}

                {pack.state === "installed" ? (
                  <p className="mt-[0.4rem] font-geist-mono text-[0.78rem] text-ui-success">Installed</p>
                ) : null}

                {pack.error ? (
                  <p className="text-[0.82rem] font-semibold text-ui-error">{pack.error}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>

      {status?.error ? (
        <div className="mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
          <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ui-error text-[0.65rem] font-bold text-white" aria-hidden="true">!</span>
          <p className="m-0">{status.error}</p>
        </div>
      ) : null}

      <div className="pt-2">
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
