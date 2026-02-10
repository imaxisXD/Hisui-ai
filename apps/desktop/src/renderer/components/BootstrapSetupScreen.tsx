import { cn } from "../lib/utils";
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
    <main className="grid min-h-screen grid-cols-[minmax(240px,360px)_minmax(400px,720px)] items-start justify-center gap-6 bg-ui-body-bg p-8 max-[1024px]:grid-cols-1 max-[1024px]:p-4">
      <section className="sticky top-8 flex flex-col gap-6 rounded-lg border border-ui-border bg-ui-bg-card p-6 animate-[staggerReveal_500ms_cubic-bezier(0.16,1,0.3,1)] max-[1024px]:static">
        <div className="flex flex-col gap-[0.4rem]">
          <span className="mb-2 inline-block h-2 w-2 rounded-full bg-ui-accent animate-[pulse_2.4s_ease-in-out_infinite]" aria-hidden="true" />
          <h1 className="m-0 font-geist-pixel text-[clamp(1.6rem,2.5vw,2.2rem)] leading-[1.1]">{appName}</h1>
          <p className="m-0 text-[0.85rem] leading-[1.5] text-ui-text-secondary">
            {status?.firstRun
              ? "First-time setup. Install the core narration runtime to get started."
              : "Starting local services. This takes a moment."}
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-md border border-ui-border bg-ui-bg-surface p-[0.85rem]">
          <div className="relative h-[52px] w-[52px] shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 80 80" role="img" aria-label={`Progress: ${percent}%`}>
              <circle className="fill-none stroke-ui-border-strong [stroke-width:4]" cx="40" cy="40" r="34" />
              <circle
                className="fill-none stroke-ui-accent [stroke-width:4] [stroke-linecap:round] transition-[stroke-dashoffset] duration-300"
                cx="40"
                cy="40"
                r="34"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - percent / 100)}`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-geist-mono text-[0.68rem] font-bold text-ui-text-primary" aria-hidden="true">{percent}%</span>
          </div>
          <div className="flex flex-1 flex-col gap-[0.15rem] text-[0.82rem]">
            <strong>{status?.message ?? "Checking runtime..."}</strong>
            <span className="font-geist-mono text-[0.72rem] text-ui-text-muted">
              {status?.bytesTotal
                ? `${formatBytes(status.bytesCopied)} / ${formatBytes(status.bytesTotal)}`
                : ""}
            </span>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-[3px] border border-ui-border px-[0.45rem] py-[0.2rem] font-geist-mono text-[0.58rem] font-semibold uppercase tracking-[0.1em]",
              phase === "awaiting-input" && "bg-ui-phase-awaiting text-ui-warning",
              phase === "running" && "bg-ui-phase-running text-ui-accent",
              phase === "error" && "bg-ui-phase-error text-ui-error",
              phase === "ready" && "bg-ui-phase-ready text-ui-success"
            )}
          >
            {phaseLabel(phase)}
          </span>
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
