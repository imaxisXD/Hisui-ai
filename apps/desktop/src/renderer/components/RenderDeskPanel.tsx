import type { RenderJob } from "../../shared/types";
import { CasterButton } from "./CasterButton";

interface RenderDeskPanelProps {
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

export function RenderDeskPanel(props: RenderDeskPanelProps) {
  const inProgress = props.renderJob?.state === "queued" || props.renderJob?.state === "running";
  const isComplete = props.renderJob?.state === "completed";
  const isFailed = props.renderJob?.state === "failed";

  const speedPercent = ((props.speed - 0.7) / (1.4 - 0.7)) * 100;

  return (
    <section className="panel panel-render">
      <div className="render-toolbar">
        <div className="render-toolbar-left">
          <p className="eyebrow">Stage 04 &mdash; Render Desk</p>
          <h2>Export your podcast</h2>
        </div>
        <div className="render-toolbar-right">
          {inProgress ? (
            <CasterButton variant="ghost" onClick={() => void props.onCancel()}>Cancel</CasterButton>
          ) : null}
          <CasterButton
            variant="primary"
            size="lg"
            className="render-btn-start"
            loading={inProgress}
            loadingText="Rendering..."
            icon={!inProgress ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg> : undefined}
            onClick={() => void props.onRender()}
            disabled={inProgress}
          >
            Start Render
          </CasterButton>
        </div>
      </div>

      {/* Controls */}
      <div className="render-config">
        {/* Output row */}
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
                  placeholder="/Users/you/Desktop"
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

        {/* Speed + options row */}
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
                  style={{ "--speed-fill": `${speedPercent}%` } as React.CSSProperties}
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

      {/* Render status */}
      {props.renderJob ? (
        <article className={`render-status ${isComplete ? "render-status--ok" : ""} ${isFailed ? "render-status--err" : ""} ${inProgress ? "render-status--active" : ""}`} role="status" aria-live="polite">
          <div className="render-status-header">
            <div className="render-status-left">
              <span className={`render-state-badge render-state-badge--${props.renderJob.state}`}>
                {stateLabel(props.renderJob.state)}
              </span>
              <span className="render-job-id">Job {props.renderJob.id.slice(0, 8)}</span>
            </div>
          </div>

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
