import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { cn } from "../lib/utils";
import type { RenderJob } from "../../shared/types";
import { HisuiButton } from "./HisuiButton";
import { HisuiAudioPlayer } from "./HisuiAudioPlayer";
import { buildRenderTargetPath, shouldConfirmOverwrite } from "./renderDeskState";

interface RenderDeskPanelProps {
  projectTitle: string;
  outputDir: string;
  outputFileName: string;
  speed: number;
  enableLlmPrep: boolean;
  renderJob: RenderJob | null;
  renderError: string | null;
  setOutputDir(next: string): void;
  setOutputFileName(next: string): void;
  setSpeed(next: number): void;
  setEnableLlmPrep(next: boolean): void;
  onBrowseOutputDir(): Promise<string | null>;
  onRevealInFileManager(path: string): Promise<void>;
  onRender(): Promise<void>;
  onCancel(): Promise<void>;
}

function stateLabel(state: RenderJob["state"]): string {
  switch (state) {
    case "queued": return "Queued";
    case "running": return "Rendering";
    case "completed": return "Complete";
    case "failed": return "Failed";
    case "canceled": return "Canceled";
    default: return state;
  }
}

const FolderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 5.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V7a1.5 1.5 0 00-1.5-1.5H8.4L6.9 4H3.5A1.5 1.5 0 002 5.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M2 5.5V4.5A1.5 1.5 0 013.5 3h3.4l1.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M6 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const FileIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 2h5.5L13 5.5V13a1.5 1.5 0 01-1.5 1.5h-7A1.5 1.5 0 013 13V3.5A1.5 1.5 0 014.5 2H4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M9.5 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    <path d="M6 9h4M6 11.5h2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const SpeedIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="9" r="6" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M8 9l2.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M6 3h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

type CopyStatus = "idle" | "copied" | "failed";

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";
const fieldLabelClass = "flex items-center gap-[0.35rem] font-geist-mono text-[0.62rem] uppercase tracking-[0.1em] text-ui-text-muted";

export function RenderDeskPanel(props: RenderDeskPanelProps) {
  const inProgress = props.renderJob?.state === "queued" || props.renderJob?.state === "running";
  const isComplete = props.renderJob?.state === "completed";
  const isErrorState = props.renderJob?.state === "failed" || props.renderJob?.state === "canceled";
  const progress = props.renderJob?.progress;

  const [showSuccessSettings, setShowSuccessSettings] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [audioSource, setAudioSource] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  const activeAudioUrlRef = useRef<string | null>(null);
  const activeAudioPathRef = useRef<string | null>(null);
  const audioLoadTokenRef = useRef(0);
  const copyResetTimerRef = useRef<number | null>(null);

  const speedPercent = ((props.speed - 0.7) / (1.4 - 0.7)) * 100;
  const computedTargetPath = buildRenderTargetPath({
    outputDir: props.outputDir,
    outputFileName: props.outputFileName,
    projectTitle: props.projectTitle
  });

  const disposeAudioPlayer = () => {
    audioLoadTokenRef.current += 1;
    const activeAudioUrl = activeAudioUrlRef.current;
    if (activeAudioUrl) {
      URL.revokeObjectURL(activeAudioUrl);
      activeAudioUrlRef.current = null;
    }
    activeAudioPathRef.current = null;
  };

  const resetAudioPlayer = () => {
    disposeAudioPlayer();
    setAudioSource("");
  };

  useEffect(() => {
    setConfirmOverwrite(false);
  }, [props.outputDir, props.outputFileName, props.projectTitle]);

  useEffect(() => {
    if (!isComplete) {
      setShowSuccessSettings(false);
      setConfirmOverwrite(false);
      setShowAudioPlayer(false);
      resetAudioPlayer();
    }
  }, [isComplete]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      disposeAudioPlayer();
    };
  }, []);

  const startRenderWithHandling = async () => {
    setActionError(null);
    try {
      await props.onRender();
      setShowSuccessSettings(false);
      setConfirmOverwrite(false);
      setShowAudioPlayer(false);
      resetAudioPlayer();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handlePrimaryRender = async () => {
    await startRenderWithHandling();
  };

  const handleRenderAgain = async (forceOverwrite: boolean) => {
    if (!isComplete) {
      await startRenderWithHandling();
      return;
    }

    const needsConfirm = shouldConfirmOverwrite({
      outputDir: props.outputDir,
      outputFileName: props.outputFileName,
      projectTitle: props.projectTitle,
      lastOutputPath: props.renderJob?.outputMp3Path
    });

    if (needsConfirm && !forceOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    await startRenderWithHandling();
  };

  const handlePlayOutput = async () => {
    const outputPath = props.renderJob?.outputMp3Path?.trim();
    if (!outputPath) {
      setActionError("Rendered file path is unavailable.");
      return;
    }
    setActionError(null);
    setShowAudioPlayer(true);

    const shouldReloadAudio = activeAudioPathRef.current !== outputPath || !audioSource;
    if (shouldReloadAudio) {
      const previousAudioSource = activeAudioUrlRef.current;
      if (previousAudioSource) {
        URL.revokeObjectURL(previousAudioSource);
        activeAudioUrlRef.current = null;
      }
      activeAudioPathRef.current = null;
      setAudioSource("");

      if (!window.app) {
        setActionError("Desktop bridge unavailable. Relaunch via Electron and try again.");
        return;
      }

      const nextToken = audioLoadTokenRef.current + 1;
      audioLoadTokenRef.current = nextToken;

      try {
        const result = await window.app.readAudioFile(outputPath);
        if (audioLoadTokenRef.current !== nextToken) {
          return;
        }

        const audioBytes = decodeBase64Audio(result.audioBase64);
        const blob = new Blob([audioBytes], { type: result.mimeType || "audio/mpeg" });
        const nextAudioSource = URL.createObjectURL(blob);

        activeAudioUrlRef.current = nextAudioSource;
        activeAudioPathRef.current = outputPath;
        setAudioSource(nextAudioSource);
        return;
      } catch {
        setActionError("Could not play output. Make sure the rendered file still exists.");
        return;
      }
    }
  };

  const handleRevealOutput = async () => {
    const outputPath = props.renderJob?.outputMp3Path?.trim();
    if (!outputPath) {
      setActionError("Rendered file path is unavailable.");
      return;
    }
    setActionError(null);
    try {
      await props.onRevealInFileManager(outputPath);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleCopyOutputPath = async () => {
    const outputPath = props.renderJob?.outputMp3Path?.trim();
    if (!outputPath) {
      setCopyStatus("failed");
      setActionError("Rendered file path is unavailable.");
      return;
    }

    try {
      await navigator.clipboard.writeText(outputPath);
      setCopyStatus("copied");
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = window.setTimeout(() => {
        setCopyStatus("idle");
      }, 1800);
    } catch {
      setCopyStatus("failed");
      setActionError("Could not copy output path to clipboard.");
    }
  };

  const showRenderControls = !isComplete || showSuccessSettings;

  return (
    <section className="flex flex-col rounded-lg border border-ui-border bg-ui-bg-panel shadow-ui-sm animate-[panelReveal_240ms_ease]">
      <div className="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <p className={eyebrowClass}>Stage 04 - Render Desk</p>
          <h2 className="m-0 text-[1.15rem]">{isComplete ? "Render complete" : "Export your podcast"}</h2>
        </div>
        <div className="flex items-center gap-2">
          {inProgress ? (
            <HisuiButton variant="ghost" onClick={() => void props.onCancel()}>Cancel</HisuiButton>
          ) : null}

          {!isComplete ? (
            <HisuiButton
              variant="primary"
              size="lg"
              className="inline-flex items-center gap-[0.45rem]"
              loading={inProgress}
              loadingText="Rendering..."
              icon={!inProgress ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg> : undefined}
              onClick={() => { void handlePrimaryRender(); }}
              disabled={inProgress}
            >
              {isErrorState ? "Render Again" : "Start Render"}
            </HisuiButton>
          ) : null}
        </div>
      </div>

      {isComplete && props.renderJob ? (
        <section className="mx-5 mt-[1.1rem] flex flex-col gap-3 rounded-lg border border-ui-success-soft-border bg-ui-success-card p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3 max-[1024px]:items-start max-[1024px]:flex-col">
            <p className="m-0 text-[0.92rem] font-semibold text-ui-success">Your episode is ready</p>
            <span className="font-geist-mono text-[0.72rem] text-ui-text-muted">Job {props.renderJob.id.slice(0, 8)}</span>
          </div>

          <div className="flex flex-wrap gap-2 max-[640px]:grid max-[640px]:w-full">
            <HisuiButton variant="primary" onClick={() => void handlePlayOutput()}>
              Play Output
            </HisuiButton>
            <HisuiButton variant="browse" onClick={() => void handleRevealOutput()}>
              Reveal in Finder
            </HisuiButton>
            <HisuiButton variant="ghost" onClick={() => void handleCopyOutputPath()}>
              Copy Path
            </HisuiButton>
            <HisuiButton variant="ghost" onClick={() => void handleRenderAgain(false)}>
              Render Again
            </HisuiButton>
          </div>

          {confirmOverwrite ? (
            <div className="flex flex-col gap-[0.55rem] rounded-md border border-ui-warning-soft-border bg-ui-warning-soft px-[0.8rem] py-[0.7rem]" role="alert">
              <p className="m-0 text-[0.78rem] text-ui-text-secondary">
                This will overwrite the previous file at
                {" "}
                <code className="font-geist-mono text-ui-warning">{props.renderJob.outputMp3Path}</code>
              </p>
              <div className="flex flex-wrap gap-2">
                <HisuiButton variant="primary" onClick={() => void handleRenderAgain(true)}>
                  Overwrite &amp; Render
                </HisuiButton>
                <HisuiButton variant="ghost" onClick={() => setConfirmOverwrite(false)}>
                  Cancel
                </HisuiButton>
              </div>
            </div>
          ) : null}

          {props.renderJob.metrics ? (
            <div className="flex flex-wrap items-start gap-6 pt-[0.15rem]">
              <Metric value={String(props.renderJob.metrics.segmentCount)} label="Segments" />
              <Metric value={`${props.renderJob.metrics.renderSeconds}s`} label="Render time" />
              <Metric value={`${props.renderJob.metrics.realtimeFactor}x`} label="RTF" />
            </div>
          ) : null}

          {props.renderJob.outputMp3Path ? (
            <div className="flex items-center gap-2 border-t border-ui-border pt-3">
              <span className="font-geist-mono text-[0.65rem] uppercase tracking-[0.08em] text-ui-text-muted">Output</span>
              <code className="rounded-[3px] bg-ui-bg-surface px-2 py-[0.2rem] font-geist-mono text-[0.78rem] text-ui-text-secondary">{props.renderJob.outputMp3Path}</code>
              {copyStatus !== "idle" ? (
                <span
                  className={cn(
                    "ml-auto font-geist-mono text-[0.65rem] uppercase tracking-[0.06em]",
                    copyStatus === "copied" ? "text-ui-success" : "text-ui-error"
                  )}
                >
                  {copyStatus === "copied" ? "Copied" : "Copy failed"}
                </span>
              ) : null}
            </div>
          ) : null}

          {showAudioPlayer && audioSource ? (
            <div className="pt-2">
              <HisuiAudioPlayer
                src={audioSource}
                autoPlay
                onError={() => setActionError("Could not load output audio file.")}
                onPlayError={() => setActionError("Could not play output. Make sure the rendered file still exists.")}
              />
            </div>
          ) : null}

          {actionError ? (
            <div className="mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
              <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ui-error text-[0.65rem] font-bold text-white" aria-hidden="true">!</span>
              <p className="m-0">{actionError}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {showRenderControls ? (
        <div className="flex flex-col gap-[0.6rem] p-5">
          <div className="rounded-lg border border-ui-border bg-ui-bg-card px-4 py-[0.85rem] transition-[border-color] duration-200 hover:border-ui-border-strong">
            <div className="flex items-start gap-4 max-[1024px]:flex-col">
              <div className="flex min-w-0 flex-[2.2] flex-col gap-[0.35rem]">
                <span className={fieldLabelClass}>
                  <span className="inline-flex text-ui-accent opacity-60" aria-hidden="true">{FolderIcon}</span>
                  Output directory
                </span>
                <div className="flex items-center overflow-hidden rounded-[5px] border border-ui-border-strong bg-ui-bg-input transition-[border-color,box-shadow] duration-150 focus-within:border-ui-accent focus-within:ring-[3px] focus-within:ring-ui-accent-soft max-[640px]:flex-col max-[640px]:items-stretch">
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent px-[0.7rem] py-[0.5rem] text-[0.82rem] text-ui-text-primary focus:outline-none"
                    value={props.outputDir}
                    onChange={(event) => props.setOutputDir(event.target.value)}
                    placeholder="/Users/you/Desktop/Hisui"
                    aria-label="Output directory path"
                  />
                  <button
                    type="button"
                    className="relative z-[1] flex h-auto w-10 shrink-0 items-center justify-center self-stretch border-0 border-l border-l-ui-border bg-transparent p-0 text-ui-text-muted transition-[background,color] duration-150 hover:bg-ui-accent-soft hover:text-ui-accent active:bg-ui-accent-soft-active max-[640px]:h-10 max-[640px]:w-full max-[640px]:border-l-0 max-[640px]:border-t max-[640px]:border-t-ui-border"
                    onClick={() => { void props.onBrowseOutputDir(); }}
                    aria-label="Browse for output folder"
                    title="Browse for folder"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ pointerEvents: "none" }}>
                      <path d="M2.5 6v8a2 2 0 002 2h9a2 2 0 002-2V8a2 2 0 00-2-2H9.3L7.6 4.5H4.5a2 2 0 00-2 2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M2.5 6V5a2 2 0 012-2h3.1L9.3 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                      <path d="M9 9v4M7 11l2 2 2-2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[0.35rem]">
                <span className={fieldLabelClass}>
                  <span className="inline-flex text-ui-accent opacity-60" aria-hidden="true">{FileIcon}</span>
                  File name
                </span>
                <div className="flex items-center overflow-hidden rounded-[5px] border border-ui-border-strong bg-ui-bg-input transition-[border-color,box-shadow] duration-150 focus-within:border-ui-accent focus-within:ring-[3px] focus-within:ring-ui-accent-soft">
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent px-[0.7rem] py-[0.5rem] text-[0.82rem] text-ui-text-primary focus:outline-none"
                    value={props.outputFileName}
                    onChange={(event) => props.setOutputFileName(event.target.value)}
                    placeholder="my-podcast"
                    aria-label="Output file name"
                  />
                  <span className="whitespace-nowrap border-l border-l-ui-border px-[0.6rem] font-geist-mono text-[0.72rem] leading-[34px] text-ui-text-muted" aria-hidden="true">.mp3</span>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-ui-border bg-ui-bg-card px-4 py-[0.85rem] transition-[border-color] duration-200 hover:border-ui-border-strong">
            <div className="flex items-stretch gap-4 max-[1024px]:flex-col">
              <div className="flex min-w-0 flex-[2] flex-col gap-[0.35rem]">
                <span className={fieldLabelClass}>
                  <span className="inline-flex text-ui-accent opacity-60" aria-hidden="true">{SpeedIcon}</span>
                  Speed
                  <span className="ml-auto text-[0.7rem] font-bold text-ui-accent">{props.speed.toFixed(2)}x</span>
                </span>
                <div className="flex flex-col gap-1">
                  <input
                    className="h-1 w-full appearance-none rounded border-0 bg-ui-speed-track p-0 [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-ui-bg-panel [&::-webkit-slider-thumb]:bg-ui-accent"
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.05}
                    value={props.speed}
                    onChange={(event) => props.setSpeed(Number(event.target.value))}
                    style={{ "--speed-fill": `${speedPercent}%` } as CSSProperties}
                  />
                  <div className="flex select-none justify-between px-[2px] font-geist-mono text-[0.55rem] text-ui-text-muted opacity-60" aria-hidden="true">
                    <span>0.7x</span>
                    <span>1.0x</span>
                    <span>1.4x</span>
                  </div>
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-[0.65rem] whitespace-nowrap border-l border-l-ui-border px-3 py-2 max-[1024px]:border-l-0 max-[1024px]:border-t max-[1024px]:border-t-ui-border">
                <span className="relative inline-flex h-5 w-9 shrink-0">
                  <input
                    className="peer absolute h-0 w-0 opacity-0"
                    type="checkbox"
                    checked={props.enableLlmPrep}
                    onChange={(event) => props.setEnableLlmPrep(event.target.checked)}
                  />
                  <span className="absolute inset-0 rounded-[10px] border border-ui-border-strong bg-ui-bg-surface transition-[background,border-color] duration-200 after:absolute after:left-[2px] after:top-[2px] after:h-[14px] after:w-[14px] after:rounded-full after:bg-ui-text-muted after:transition-[transform,background] after:duration-200 peer-checked:border-ui-accent-ghost-border peer-checked:bg-ui-accent-soft peer-checked:after:translate-x-4 peer-checked:after:bg-ui-accent" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-[0.1rem]">
                  <span className="font-geist-sans text-[0.78rem] font-medium text-ui-text-primary">LLM text prep</span>
                  <span className="font-geist-mono text-[0.6rem] tracking-[0.02em] text-ui-text-muted">Process text before TTS</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-[0.6rem] p-5 pt-[0.9rem]">
          <div className="flex flex-col gap-[0.55rem] rounded-lg border border-ui-border bg-ui-bg-card px-4 py-[0.85rem]">
            <div className="flex items-center justify-between gap-3 max-[1024px]:items-start max-[1024px]:flex-col">
              <span className="font-geist-mono text-[0.65rem] uppercase tracking-[0.08em] text-ui-text-muted">Output directory</span>
              <code className="rounded-[3px] bg-ui-bg-surface px-2 py-[0.2rem] font-geist-mono text-[0.78rem] text-ui-text-secondary">{props.outputDir || "(not set)"}</code>
            </div>
            <div className="flex items-center justify-between gap-3 max-[1024px]:items-start max-[1024px]:flex-col">
              <span className="font-geist-mono text-[0.65rem] uppercase tracking-[0.08em] text-ui-text-muted">File target</span>
              <code className="rounded-[3px] bg-ui-bg-surface px-2 py-[0.2rem] font-geist-mono text-[0.78rem] text-ui-text-secondary">{computedTargetPath ?? "(not set)"}</code>
            </div>
            <div className="flex items-center justify-between gap-3 font-geist-mono text-[0.72rem] text-ui-text-secondary">
              <span>Speed: {props.speed.toFixed(2)}x</span>
              <span>LLM prep: {props.enableLlmPrep ? "Enabled" : "Disabled"}</span>
            </div>
            <div className="flex justify-end pt-[0.15rem] max-[1024px]:justify-start">
              <HisuiButton variant="ghost" onClick={() => setShowSuccessSettings(true)}>
                Edit settings
              </HisuiButton>
            </div>
          </div>
        </div>
      )}

      {props.renderJob && !isComplete ? (
        <article
          className={cn(
            "mx-5 mb-5 flex flex-col gap-3 rounded-md border bg-ui-bg-card p-4",
            inProgress && "border-ui-accent-ghost-border animate-[statusPulse_2s_ease-in-out_infinite]",
            !inProgress && isErrorState && "border-ui-error-border-strong",
            !inProgress && !isErrorState && "border-ui-border"
          )}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={renderStateBadgeClass(props.renderJob.state)}>
                {stateLabel(props.renderJob.state)}
              </span>
              <span className="font-geist-mono text-[0.72rem] text-ui-text-muted">Job {props.renderJob.id.slice(0, 8)}</span>
            </div>
          </div>

          {progress && inProgress ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-4">
                <span className="text-[0.78rem] text-ui-text-secondary">{progress.message}</span>
                <span className="font-geist-mono text-[0.78rem] font-bold tracking-[0.04em] text-ui-accent">{Math.round(progress.percent)}%</span>
              </div>
              <div className="h-[6px] w-full overflow-hidden rounded-[3px] border border-ui-border bg-ui-bg-input" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-[3px] bg-ui-progress transition-[width] duration-250" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
              </div>
              <div className="flex items-center justify-between gap-4 font-geist-mono text-[0.62rem] uppercase tracking-[0.05em] text-ui-text-muted">
                {progress.totalSegments ? (
                  <span>
                    Segments {Math.max(0, progress.completedSegments ?? 0)}/{progress.totalSegments}
                  </span>
                ) : (
                  <span>{progress.approximate ? "Approximate progress" : "Measured progress"}</span>
                )}
                <span>
                  {progress.etaSeconds !== undefined
                    ? `ETA ~${formatEta(progress.etaSeconds)}`
                    : "Estimating..."}
                </span>
              </div>
            </div>
          ) : null}

          {props.renderJob.metrics ? (
            <div className="flex flex-wrap items-start gap-6">
              <Metric value={String(props.renderJob.metrics.segmentCount)} label="Segments" />
              <Metric value={`${props.renderJob.metrics.renderSeconds}s`} label="Render time" />
              <Metric value={`${props.renderJob.metrics.realtimeFactor}x`} label="RTF" />
            </div>
          ) : null}

          {props.renderJob.outputMp3Path ? (
            <div className="flex items-center gap-2 border-t border-ui-border pt-2">
              <span className="font-geist-mono text-[0.65rem] uppercase tracking-[0.08em] text-ui-text-muted">Output</span>
              <code className="rounded-[3px] bg-ui-bg-surface px-2 py-[0.2rem] font-geist-mono text-[0.78rem] text-ui-text-secondary">{props.renderJob.outputMp3Path}</code>
            </div>
          ) : null}

          {props.renderJob.errorText ? (
            <div className="mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
              <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ui-error text-[0.65rem] font-bold text-white" aria-hidden="true">!</span>
              <p className="m-0">{props.renderJob.errorText}</p>
            </div>
          ) : null}
        </article>
      ) : null}

      {props.renderError ? (
        <div className="mx-5 mb-5 mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
          <span className="mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-ui-error text-[0.65rem] font-bold text-white" aria-hidden="true">!</span>
          <p className="m-0">{props.renderError}</p>
        </div>
      ) : null}
    </section>
  );
}

function renderStateBadgeClass(state: RenderJob["state"]) {
  return cn(
    "rounded-[3px] px-[0.5rem] py-[0.2rem] font-geist-mono text-[0.68rem] font-bold uppercase tracking-[0.06em]",
    state === "queued" && "bg-ui-phase-awaiting text-ui-warning",
    state === "running" && "bg-ui-phase-running text-ui-accent",
    state === "completed" && "bg-ui-phase-ready text-ui-success",
    state === "failed" && "bg-ui-phase-error text-ui-error",
    state === "canceled" && "bg-ui-bg-surface text-ui-text-muted"
  );
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-geist-mono text-[1.1rem] font-bold text-ui-text-primary">{value}</span>
      <span className="font-geist-mono text-[0.62rem] uppercase tracking-[0.08em] text-ui-text-muted">{label}</span>
    </div>
  );
}

function formatEta(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function decodeBase64Audio(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
