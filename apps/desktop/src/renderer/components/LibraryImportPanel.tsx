import { useMemo, useState } from "react";
import type { ImportResult, ProjectHistoryDetails, ProjectHistoryItem } from "../../shared/types";
import { HisuiButton } from "./HisuiButton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardHeader, CardContent } from "./ui/card";
import { Alert, AlertIcon, AlertDescription } from "./ui/alert";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./ui/accordion";
import { Button } from "./ui/button";
import { Search, X, AlertCircle, Pencil, Play, FolderOpen } from "lucide-react";

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
  projectHistory: ProjectHistoryItem[];
  projectHistoryLoading: boolean;
  projectHistoryError: string | null;
  selectedProjectHistoryId: string | null;
  selectedProjectHistory: ProjectHistoryDetails | null;
  projectHistoryDetailsLoading: boolean;
  projectHistoryDetailsError: string | null;
  onRefreshProjectHistory(): Promise<void>;
  onSelectProjectHistory(projectId: string): Promise<void>;
  onReworkSelectedProject(): Promise<void>;
  onOpenSelectedProjectInRender(): Promise<void>;
  onRevealInFileManager(path: string): Promise<void>;
}

const FolderIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 4h5l1.5 2H14v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M2 4V3a1 1 0 0 1 1-1h4l1.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
);

const DEFAULT_SNAPSHOT_LINES = 5;
const DEFAULT_SNAPSHOT_CHARS = 620;

export function LibraryImportPanel(props: LibraryImportPanelProps) {
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [revealError, setRevealError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  const canSubmitPaste = pasteText.trim().length > 20;
  const pasteCharCount = pasteText.length;
  const selectedProject = props.selectedProjectHistory?.project ?? null;
  const recentRenderJobs = props.selectedProjectHistory?.recentRenderJobs ?? [];
  const scriptSnapshot = useMemo(
    () => (selectedProject ? buildScriptSnapshot(selectedProject, DEFAULT_SNAPSHOT_LINES, DEFAULT_SNAPSHOT_CHARS) : ""),
    [selectedProject]
  );

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return props.projectHistory;
    const q = searchQuery.toLowerCase();
    return props.projectHistory.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.sourceFormat.toLowerCase().includes(q)
    );
  }, [props.projectHistory, searchQuery]);

  const handlePasteSubmit = () => {
    const title = pasteTitle.trim() || "Untitled Paste";
    props.onPasteImport(title, pasteText.trim());
  };

  const handleReveal = async (path: string) => {
    setRevealError(null);
    try {
      await props.onRevealInFileManager(path);
    } catch (error) {
      setRevealError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleAccordionChange = (value: string) => {
    if (value) {
      void props.onSelectProjectHistory(value);
    }
  };

  return (
    <section className="panel panel-library panel-library--workspace">
      <div className="library-workspace">
        <div className="library-intake">
          {!props.importResult ? (
            <div className="library-hero">
              <div className="library-hero-text">
                <p className="eyebrow">Stage 01 - Book Intake</p>
                <h2>Bring your words</h2>
                <p className="library-hero-sub">
                  Import a file from your machine or paste text directly.
                  Hisui extracts chapters and prepares segments for voice casting.
                </p>
              </div>

              <Tabs defaultValue="file" className="w-full max-w-[520px]">
                <TabsList
                  variant="button"
                  className="flex gap-2 p-0 w-full"
                >
                  <TabsTrigger
                    value="file"
                    className="flex-1 shrink flex gap-[0.65rem] py-3 px-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] font-normal whitespace-normal justify-start text-left transition-all [&_svg]:text-inherit hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] data-[state=active]:border-[var(--accent)] data-[state=active]:bg-[var(--accent-soft)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-[0_0_0_1px_var(--accent-ghost-border)]"
                  >
                    <span className="intake-tab-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                    </span>
                    <span className="intake-tab-text">
                      <span className="intake-tab-label">From file</span>
                      <span className="intake-tab-desc">EPUB, PDF, or TXT</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="paste"
                    className="flex-1 shrink flex gap-[0.65rem] py-3 px-4 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[var(--text-secondary)] font-normal whitespace-normal justify-start text-left transition-all [&_svg]:text-inherit hover:bg-[var(--bg-hover)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] data-[state=active]:border-[var(--accent)] data-[state=active]:bg-[var(--accent-soft)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-[0_0_0_1px_var(--accent-ghost-border)]"
                  >
                    <span className="intake-tab-icon" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="1" width="8" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="3" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </span>
                    <span className="intake-tab-text">
                      <span className="intake-tab-label">Paste text</span>
                      <span className="intake-tab-desc">Direct input</span>
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-6">
                  <div className="library-dropzone">
                    <div className="dropzone-inner">
                      <div className="dropzone-header">
                        <span className="dropzone-glyph" aria-hidden="true">
                          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M7 4h8l6 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M15 4v6h6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M14 15v5M12 18l2 2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                        <span className="dropzone-header-text">Choose a book file</span>
                      </div>

                      <HisuiButton
                        variant="browse"
                        size="md"
                        icon={FolderIcon}
                        onClick={() => void props.onBrowse()}
                      >
                        Browse files
                      </HisuiButton>

                      <div className="dropzone-divider">
                        <Separator className="dropzone-divider-line" />
                        <span className="dropzone-divider-text">or type a path</span>
                        <Separator className="dropzone-divider-line" />
                      </div>

                      <label htmlFor="book-path" className="dropzone-label">File path</label>
                      <Input
                        id="book-path"
                        value={props.filePath}
                        onChange={(event) => props.setFilePath(event.target.value)}
                        placeholder="/Users/you/Books/story.epub"
                        className="dropzone-input"
                      />
                      <div className="dropzone-formats">
                        <Badge variant="outline" className="format-chip">.epub</Badge>
                        <Badge variant="outline" className="format-chip">.pdf</Badge>
                        <Badge variant="outline" className="format-chip">.txt</Badge>
                      </div>
                      <HisuiButton
                        variant="primary"
                        size="lg"
                        loading={props.importing}
                        loadingText="Importing..."
                        onClick={() => void props.onImport()}
                        disabled={!props.filePath.trim()}
                      >
                        Import Book
                      </HisuiButton>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="paste" className="mt-6">
                  <div className="library-pastezone">
                    <div className="pastezone-inner">
                      <label className="paste-field">
                        <span className="paste-field-label">Title</span>
                        <Input
                          value={pasteTitle}
                          onChange={(event) => setPasteTitle(event.target.value)}
                          placeholder="My podcast script"
                          className="paste-title-input"
                        />
                      </label>
                      <label className="paste-field paste-field--grow">
                        <span className="paste-field-label">Content</span>
                        <Textarea
                          className="paste-textarea"
                          value={pasteText}
                          onChange={(event) => setPasteText(event.target.value)}
                          placeholder="Paste your text here... Use blank lines to separate chapters or sections."
                        />
                      </label>
                      <div className="paste-footer">
                        <span className="paste-char-count" aria-label="Character count">
                          {pasteCharCount.toLocaleString()} chars
                        </span>
                        <HisuiButton
                          variant="primary"
                          size="lg"
                          onClick={handlePasteSubmit}
                          disabled={!canSubmitPaste}
                        >
                          Use This Text
                        </HisuiButton>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {props.importError ? (
                <Alert variant="destructive" appearance="solid" className="alert alert-error">
                  <AlertIcon><AlertCircle className="h-4 w-4" /></AlertIcon>
                  <AlertDescription>{props.importError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="library-result">
              <p className="eyebrow">Stage 01 - Book Intake</p>
              <h2>Ready to begin</h2>

              <Card className="import-card">
                <CardHeader className="import-card-header">
                  <Badge variant="outline" className="import-card-format">{props.importResult.sourceFormat.toUpperCase()}</Badge>
                  <h3>{props.importResult.title}</h3>
                </CardHeader>
                <CardContent className="import-card-stats">
                  <div className="stat-block">
                    <span className="stat-value">{props.importResult.chapters.length}</span>
                    <span className="stat-label">Chapters</span>
                  </div>
                </CardContent>

                {props.importResult.warnings.length > 0 ? (
                  <CardContent className="import-warnings">
                    {props.importResult.warnings.map((warning) => (
                      <p key={warning} className="warning-text">{warning}</p>
                    ))}
                  </CardContent>
                ) : null}
              </Card>

              <div className="library-actions">
                <HisuiButton variant="primary" size="lg" onClick={() => void props.onCreateProject()}>
                  Create Project &amp; Continue
                </HisuiButton>
                <HisuiButton variant="ghost" onClick={() => void props.onImport()} disabled={props.importing}>
                  Re-import
                </HisuiButton>
              </div>

              {props.importError ? (
                <Alert variant="destructive" appearance="solid" className="alert alert-error">
                  <AlertIcon><AlertCircle className="h-4 w-4" /></AlertIcon>
                  <AlertDescription>{props.importError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </div>

        <aside className="lh" aria-label="Past creations">
          {/* ── Header ── */}
          <div className="lh-header">
            <div className="lh-header-left">
              <svg className="lh-header-icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              </svg>
              <h3 className="lh-title">Library</h3>
              <span className="lh-count">{props.projectHistory.length}</span>
            </div>
            <button
              className="lh-refresh-btn"
              onClick={() => void props.onRefreshProjectHistory()}
              disabled={props.projectHistoryLoading}
              aria-label="Refresh project list"
              title="Refresh"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={props.projectHistoryLoading ? "lh-spin" : ""}>
                <path d="M12 7a5 5 0 1 1-1-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M12 2v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* ── Search ── */}
          <div className="lh-search-wrapper">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="lh-search-input pl-8 pr-8"
              />
              {searchQuery && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {props.projectHistoryError ? (
            <p className="warning-text" role="alert">{props.projectHistoryError}</p>
          ) : null}

          {/* ── Project List ── */}
          <ScrollArea className="lh-list">
            {filteredHistory.length === 0 ? (
              <div className="lh-empty">
                {props.projectHistoryLoading ? (
                  <div className="lh-empty-loading">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <p>Loading projects...</p>
                  </div>
                ) : searchQuery ? (
                  <>
                    <p className="lh-empty-text">No matches for &ldquo;{searchQuery}&rdquo;</p>
                    <button className="lh-empty-clear" onClick={() => setSearchQuery("")}>Clear search</button>
                  </>
                ) : (
                  <>
                    <svg className="lh-empty-icon" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                      <rect x="6" y="4" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.3"/>
                      <path d="M11 11h10M11 15h7M11 19h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2"/>
                    </svg>
                    <p className="lh-empty-text">No projects yet</p>
                    <p className="lh-empty-sub">Import a file to get started. Your creations will appear here.</p>
                  </>
                )}
              </div>
            ) : (
              <Accordion
                type="single"
                collapsible
                indicator="none"
                value={props.selectedProjectHistoryId ?? ""}
                onValueChange={handleAccordionChange}
              >
                {filteredHistory.map((item, index) => {
                  const formatColor = getFormatColor(item.sourceFormat);
                  const isActive = props.selectedProjectHistoryId === item.id;
                  return (
                    <AccordionItem
                      key={item.id}
                      value={item.id}
                      className={`lh-card border-b-0 ${isActive ? "lh-card--active" : ""}`}
                      style={{ "--format-color": formatColor, "--card-index": index } as React.CSSProperties}
                    >
                      <AccordionTrigger className="lh-card-btn py-0 gap-0 font-normal">
                        <div className="lh-card-accent" aria-hidden="true" />
                        <div className="lh-card-body">
                          <div className="lh-card-row">
                            <span className="lh-card-title">{item.title}</span>
                            <Badge variant="outline" className="lh-card-format" data-format={item.sourceFormat}>
                              {item.sourceFormat.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="lh-card-stats">
                            <span>{item.chapterCount} ch</span>
                            <span className="lh-card-dot" aria-hidden="true" />
                            <span>{item.segmentCount} seg</span>
                            <span className="lh-card-dot" aria-hidden="true" />
                            <span>{formatTimeAgo(item.updatedAt)}</span>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="lh-expand">
                        {props.projectHistoryDetailsLoading ? (
                          <div className="lh-expand-loading">
                            <Skeleton className="h-3 w-3 rounded-full" />
                            <span>Loading...</span>
                          </div>
                        ) : selectedProject && isActive ? (
                          <>
                            <div className="lh-expand-meta">
                              <p>
                                <span className="lh-expand-label">Edited</span>
                                {formatAbsoluteDate(selectedProject.updatedAt)}
                              </p>
                              {selectedProject.sourcePath.trim() && (
                                <p className="lh-expand-path" title={selectedProject.sourcePath}>
                                  <span className="lh-expand-label">Source</span>
                                  {truncatePath(selectedProject.sourcePath)}
                                </p>
                              )}
                            </div>

                            <div className="lh-expand-actions">
                              <Button variant="ghost" size="sm" className="lh-action lh-action--primary" onClick={() => void props.onReworkSelectedProject()}>
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="lh-action" onClick={() => void props.onOpenSelectedProjectInRender()}>
                                <Play className="h-3 w-3" />
                                Render
                              </Button>
                              {selectedProject.sourcePath.trim() ? (
                                <Button variant="ghost" size="sm" className="lh-action" onClick={() => void handleReveal(selectedProject.sourcePath)}>
                                  <FolderOpen className="h-3 w-3" />
                                  Reveal
                                </Button>
                              ) : null}
                            </div>

                            {scriptSnapshot ? (
                              <div className="lh-expand-snapshot">
                                <p className="lh-expand-label">Preview</p>
                                <pre>{scriptSnapshot}</pre>
                              </div>
                            ) : null}

                            {recentRenderJobs.length > 0 && (
                              <div className="lh-expand-renders">
                                <p className="lh-expand-label">Renders</p>
                                {recentRenderJobs.slice(0, 3).map((job) => (
                                  <div key={job.id} className="lh-render-row">
                                    <Badge
                                      variant={job.state === "completed" ? "primary" : "outline"}
                                      className={`lh-render-badge lh-render-badge--${job.state}`}
                                    >
                                      {job.state}
                                    </Badge>
                                    <span className="lh-render-time">{formatTimeAgo(job.finishedAt ?? job.startedAt ?? selectedProject.updatedAt)}</span>
                                    {job.outputMp3Path ? (
                                      <button className="lh-render-reveal" onClick={() => void handleReveal(job.outputMp3Path ?? "")}>
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5l3.5-3.5M4.5 1.5V5.5H8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 7h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></svg>
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}

                            {revealError ? <p className="warning-text" role="alert" style={{ fontSize: "0.7rem", margin: 0 }}>{revealError}</p> : null}
                          </>
                        ) : null}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </ScrollArea>
        </aside>
      </div>
    </section>
  );
}

function buildScriptSnapshot(
  project: ProjectHistoryDetails["project"],
  maxLines: number,
  maxChars: number
): string {
  const lines: string[] = [];
  for (const chapter of project.chapters) {
    for (const segment of chapter.segments) {
      lines.push(segment.text.trim());
      if (lines.length >= maxLines) {
        break;
      }
    }
    if (lines.length >= maxLines) {
      break;
    }
  }
  const snapshot = lines.filter(Boolean).join("\n");
  if (snapshot.length <= maxChars) {
    return snapshot;
  }
  return `${snapshot.slice(0, maxChars).trimEnd()}...`;
}

function formatTimeAgo(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "unknown";
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatAbsoluteDate(input: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

function getFormatColor(format: string): string {
  switch (format) {
    case "epub": return "#60a5fa";
    case "pdf": return "#f87171";
    case "txt": return "#34d399";
    default: return "#c084fc";
  }
}

function truncatePath(p: string): string {
  if (p.length <= 36) return p;
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return `.../${parts[parts.length - 1]}`;
  return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}
