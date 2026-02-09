import { useState } from "react";
import type { ImportResult } from "../../shared/types";
import { CasterButton } from "./CasterButton";

type IntakeMode = "file" | "paste";

interface LibraryImportPanelProps {
  filePath: string;
  setFilePath(next: string): void;
  importResult: ImportResult | null;
  importing: boolean;
  importError: string | null;
  onImport(): Promise<void>;
  onBrowse(): Promise<void>;
  onPasteImport(title: string, text: string): void;
  onCreateProject(): Promise<void>;
}

const FolderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h5l1.5 2H14v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 4V3a1 1 0 0 1 1-1h4l1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
);

export function LibraryImportPanel(props: LibraryImportPanelProps) {
  const [mode, setMode] = useState<IntakeMode>("file");
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");

  const canSubmitPaste = pasteText.trim().length > 20;
  const pasteCharCount = pasteText.length;

  const handlePasteSubmit = () => {
    const title = pasteTitle.trim() || "Untitled Paste";
    props.onPasteImport(title, pasteText.trim());
  };

  return (
    <section className="panel panel-library">
      {/* Hero welcome when no import yet */}
      {!props.importResult ? (
        <div className="library-hero">
          <div className="library-hero-text">
            <p className="eyebrow">Stage 01 &mdash; Book Intake</p>
            <h2>Bring your words</h2>
            <p className="library-hero-sub">
              Import a file from your machine or paste text directly.
              Caster extracts chapters and prepares segments for voice casting.
            </p>
          </div>

          {/* Mode switcher */}
          <div className="intake-switcher" role="tablist" aria-label="Import method">
            <button
              role="tab"
              aria-selected={mode === "file"}
              className={`intake-tab ${mode === "file" ? "intake-tab--active" : ""}`}
              onClick={() => setMode("file")}
            >
              <span className="intake-tab-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
              </span>
              <span className="intake-tab-text">
                <span className="intake-tab-label">From file</span>
                <span className="intake-tab-desc">EPUB, PDF, or TXT</span>
              </span>
            </button>
            <button
              role="tab"
              aria-selected={mode === "paste"}
              className={`intake-tab ${mode === "paste" ? "intake-tab--active" : ""}`}
              onClick={() => setMode("paste")}
            >
              <span className="intake-tab-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="1" width="8" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="3" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </span>
              <span className="intake-tab-text">
                <span className="intake-tab-label">Paste text</span>
                <span className="intake-tab-desc">Direct input</span>
              </span>
            </button>
          </div>

          {/* File mode */}
          {mode === "file" ? (
            <div className="library-dropzone" role="tabpanel" aria-label="Import from file">
              <div className="dropzone-inner">
                <div className="dropzone-header">
                  <span className="dropzone-glyph" aria-hidden="true">
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M7 4h8l6 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M15 4v6h6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M14 15v5M12 18l2 2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </span>
                  <span className="dropzone-header-text">Choose a book file</span>
                </div>

                <CasterButton
                  variant="browse"
                  size="md"
                  icon={FolderIcon}
                  onClick={() => void props.onBrowse()}
                >
                  Browse files
                </CasterButton>

                <div className="dropzone-divider">
                  <span className="dropzone-divider-line" aria-hidden="true" />
                  <span className="dropzone-divider-text">or type a path</span>
                  <span className="dropzone-divider-line" aria-hidden="true" />
                </div>

                <label htmlFor="book-path" className="dropzone-label">File path</label>
                <input
                  id="book-path"
                  value={props.filePath}
                  onChange={(event) => props.setFilePath(event.target.value)}
                  placeholder="/Users/you/Books/story.epub"
                  className="dropzone-input"
                />
                <div className="dropzone-formats">
                  <span className="format-chip">.epub</span>
                  <span className="format-chip">.pdf</span>
                  <span className="format-chip">.txt</span>
                </div>
                <CasterButton
                  variant="primary"
                  size="lg"
                  loading={props.importing}
                  loadingText="Importing\u2026"
                  onClick={() => void props.onImport()}
                  disabled={!props.filePath.trim()}
                >
                  Import Book
                </CasterButton>
              </div>
            </div>
          ) : (
            /* Paste mode */
            <div className="library-pastezone" role="tabpanel" aria-label="Paste text directly">
              <div className="pastezone-inner">
                <label className="paste-field">
                  <span className="paste-field-label">Title</span>
                  <input
                    value={pasteTitle}
                    onChange={(event) => setPasteTitle(event.target.value)}
                    placeholder="My podcast script"
                    className="paste-title-input"
                  />
                </label>
                <label className="paste-field paste-field--grow">
                  <span className="paste-field-label">Content</span>
                  <textarea
                    className="paste-textarea"
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="Paste your text here&#8230; Use blank lines to separate chapters or sections."
                  />
                </label>
                <div className="paste-footer">
                  <span className="paste-char-count" aria-label="Character count">
                    {pasteCharCount.toLocaleString()} chars
                  </span>
                  <CasterButton
                    variant="primary"
                    size="lg"
                    onClick={handlePasteSubmit}
                    disabled={!canSubmitPaste}
                  >
                    Use This Text
                  </CasterButton>
                </div>
              </div>
            </div>
          )}

          {props.importError ? (
            <div className="alert alert-error">
              <span className="alert-icon" aria-hidden="true">!</span>
              <p>{props.importError}</p>
            </div>
          ) : null}
        </div>
      ) : (
        /* Import result — ready to create project */
        <div className="library-result">
          <p className="eyebrow">Stage 01 &mdash; Book Intake</p>
          <h2>Ready to begin</h2>

          <article className="import-card">
            <div className="import-card-header">
              <span className="import-card-format">{props.importResult.sourceFormat.toUpperCase()}</span>
              <h3>{props.importResult.title}</h3>
            </div>
            <div className="import-card-stats">
              <div className="stat-block">
                <span className="stat-value">{props.importResult.chapters.length}</span>
                <span className="stat-label">Chapters</span>
              </div>
            </div>

            {props.importResult.warnings.length > 0 ? (
              <div className="import-warnings">
                {props.importResult.warnings.map((warning) => (
                  <p key={warning} className="warning-text">{warning}</p>
                ))}
              </div>
            ) : null}
          </article>

          <div className="library-actions">
            <CasterButton variant="primary" size="lg" onClick={() => void props.onCreateProject()}>
              Create Project &amp; Continue
            </CasterButton>
            <CasterButton variant="ghost" onClick={() => void props.onImport()} disabled={props.importing}>
              Re-import
            </CasterButton>
          </div>

          {props.importError ? (
            <div className="alert alert-error">
              <span className="alert-icon" aria-hidden="true">!</span>
              <p>{props.importError}</p>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
