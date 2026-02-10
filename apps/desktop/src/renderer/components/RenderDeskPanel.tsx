import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
    <section className="panel panel-render">
      <div className="render-toolbar">
        <div className="render-toolbar-left">
          <p className="eyebrow">Stage 04 &mdash; Render Desk</p>
          <h2>{isComplete ? "Render complete" : "Export your podcast"}</h2>
        </div>
        <div className="render-toolbar-right">
          {inProgress ? (
            <HisuiButton variant="ghost" onClick={() => void props.onCancel()}>Cancel</HisuiButton>
          ) : null}

          {!isComplete ? (
            <HisuiButton
              variant="primary"
              size="lg"
              className="render-btn-start"
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
        <section className="render-success" aria-live="polite">
          <div className="render-success-header">
            <p className="render-success-kicker">Your episode is ready</p>
            <span className="render-job-id">Job {props.renderJob.id.slice(0, 8)}</span>
          </div>

          <div className="render-success-actions">
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
            <div className="render-overwrite-confirm" role="alert">
              <p>
                This will overwrite the previous file at
                {" "}
                <code>{props.renderJob.outputMp3Path}</code>
              </p>
              <div className="render-overwrite-actions">
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
            <div className="render-metrics render-metrics--success">
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.segmentCount}</span>
                <span className="render-metric-label">Segments</span>
              </div>
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.renderSeconds}s</span>
                <span className="render-metric-label">Render time</span>
              </div>
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.realtimeFactor}x</span>
                <span className="render-metric-label">RTF</span>
              </div>
            </div>
          ) : null}

          {props.renderJob.outputMp3Path ? (
            <div className="render-output render-output--success">
              <span className="render-output-label">Output</span>
              <code className="render-output-path">{props.renderJob.outputMp3Path}</code>
              {copyStatus !== "idle" ? (
                <span className={`render-copy-status render-copy-status--${copyStatus}`}>
                  {copyStatus === "copied" ? "Copied" : "Copy failed"}
                </span>
              ) : null}
            </div>
          ) : null}

          {showAudioPlayer && audioSource ? (
            <div className="render-audio-wrap">
              <HisuiAudioPlayer
                src={audioSource}
                autoPlay
                onError={() => setActionError("Could not load output audio file.")}
                onPlayError={() => setActionError("Could not play output. Make sure the rendered file still exists.")}
              />
            </div>
          ) : null}

          {actionError ? (
            <div className="alert alert-error">
              <span className="alert-icon" aria-hidden="true">!</span>
              <p>{actionError}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {showRenderControls ? (
        <div className="render-config">
          <div className="render-config-group">
            <div className="render-config-row">
              <div className="render-field render-field--wide">
                <span className="render-field-label">
                  <span className="render-field-label-icon" aria-hidden="true">{FolderIcon}</span>
                  Output directory
                </span>
                <div className="render-path-picker">
                  <input
                    value={props.outputDir}
                    onChange={(event) => props.setOutputDir(event.target.value)}
                    placeholder="/Users/you/Desktop/Hisui"
                    aria-label="Output directory path"
                  />
                  <button
                    type="button"
                    className="render-path-browse-icon"
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
              <div className="render-field">
                <span className="render-field-label">
                  <span className="render-field-label-icon" aria-hidden="true">{FileIcon}</span>
                  File name
                </span>
                <div className="render-filename-wrap">
                  <input
                    value={props.outputFileName}
                    onChange={(event) => props.setOutputFileName(event.target.value)}
                    placeholder="my-podcast"
                    aria-label="Output file name"
                  />
                  <span className="render-filename-ext" aria-hidden="true">.mp3</span>
                </div>
              </div>
            </div>
          </div>

          <div className="render-config-group">
            <div className="render-config-row render-config-row--options">
              <div className="render-field render-field--speed">
                <span className="render-field-label">
                  <span className="render-field-label-icon" aria-hidden="true">{SpeedIcon}</span>
                  Speed
                  <span className="render-speed-value">{props.speed.toFixed(2)}x</span>
                </span>
                <div className="render-speed-track">
                  <input
                    type="range"
                    min={0.7}
                    max={1.4}
                    step={0.05}
                    value={props.speed}
                    onChange={(event) => props.setSpeed(Number(event.target.value))}
                    style={{ "--speed-fill": `${speedPercent}%` } as CSSProperties}
                  />
                  <div className="render-speed-labels" aria-hidden="true">
                    <span>0.7x</span>
                    <span>1.0x</span>
                    <span>1.4x</span>
                  </div>
                </div>
              </div>
              <label className="render-field render-field--check">
                <span className="render-check-toggle">
                  <input
                    type="checkbox"
                    checked={props.enableLlmPrep}
                    onChange={(event) => props.setEnableLlmPrep(event.target.checked)}
                  />
                  <span className="render-check-slider" aria-hidden="true" />
                </span>
                <span className="render-check-text">
                  <span className="render-check-label">LLM text prep</span>
                  <span className="render-check-desc">Process text before TTS</span>
                </span>
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className="render-config render-config--summary">
          <div className="render-config-group render-settings-summary">
            <div className="render-settings-summary-row">
              <span className="render-output-label">Output directory</span>
              <code className="render-output-path">{props.outputDir || "(not set)"}</code>
            </div>
            <div className="render-settings-summary-row">
              <span className="render-output-label">File target</span>
              <code className="render-output-path">{computedTargetPath ?? "(not set)"}</code>
            </div>
            <div className="render-settings-summary-row render-settings-summary-row--meta">
              <span>Speed: {props.speed.toFixed(2)}x</span>
              <span>LLM prep: {props.enableLlmPrep ? "Enabled" : "Disabled"}</span>
            </div>
            <div className="render-settings-summary-actions">
              <HisuiButton variant="ghost" onClick={() => setShowSuccessSettings(true)}>
                Edit settings
              </HisuiButton>
            </div>
          </div>
        </div>
      )}

      {props.renderJob && !isComplete ? (
        <article className={`render-status ${isErrorState ? "render-status--err" : ""} ${inProgress ? "render-status--active" : ""}`} role="status" aria-live="polite">
          <div className="render-status-header">
            <div className="render-status-left">
              <span className={`render-state-badge render-state-badge--${props.renderJob.state}`}>
                {stateLabel(props.renderJob.state)}
              </span>
              <span className="render-job-id">Job {props.renderJob.id.slice(0, 8)}</span>
            </div>
          </div>

          {progress && inProgress ? (
            <div className="render-progress">
              <div className="render-progress-head">
                <span className="render-progress-phase">{progress.message}</span>
                <span className="render-progress-percent">{Math.round(progress.percent)}%</span>
              </div>
              <div className="progress-track" role="progressbar" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
              </div>
              <div className="render-progress-meta">
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
            <div className="render-metrics">
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.segmentCount}</span>
                <span className="render-metric-label">Segments</span>
              </div>
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.renderSeconds}s</span>
                <span className="render-metric-label">Render time</span>
              </div>
              <div className="render-metric">
                <span className="render-metric-value">{props.renderJob.metrics.realtimeFactor}x</span>
                <span className="render-metric-label">RTF</span>
              </div>
            </div>
          ) : null}

          {props.renderJob.outputMp3Path ? (
            <div className="render-output">
              <span className="render-output-label">Output</span>
              <code className="render-output-path">{props.renderJob.outputMp3Path}</code>
            </div>
          ) : null}

          {props.renderJob.errorText ? (
            <div className="alert alert-error">
              <span className="alert-icon" aria-hidden="true">!</span>
              <p>{props.renderJob.errorText}</p>
            </div>
          ) : null}
        </article>
      ) : null}

      {props.renderError ? (
        <div className="alert alert-error">
          <span className="alert-icon" aria-hidden="true">!</span>
          <p>{props.renderError}</p>
        </div>
      ) : null}
    </section>
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
