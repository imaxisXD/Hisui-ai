import { useMemo, useState } from "react";
import { cn } from "../lib/utils";
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

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";
const warningTextClass = "text-[0.82rem] text-ui-warning";

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
    <section className="rounded-lg border-0 bg-transparent shadow-none">
      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5 max-[1024px]:grid-cols-1">
        <div className="min-w-0">
          {!props.importResult ? (
            <div className="flex min-h-[calc(100vh-44px-72px-2.5rem)] flex-col items-center justify-center gap-6 text-center animate-[staggerReveal_600ms_cubic-bezier(0.16,1,0.3,1)] max-[1024px]:min-h-auto max-[1024px]:px-4 max-[1024px]:py-8">
              <div className="max-w-[480px]">
                <p className={eyebrowClass}>Stage 01 - Book Intake</p>
                <h2 className="my-[0.4rem] mb-[0.6rem] font-geist-pixel text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.1]">Bring your words</h2>
                <p className="m-0 text-[0.9rem] leading-[1.6] text-ui-text-secondary">
                  Import a file from your machine or paste text directly.
                  Hisui extracts chapters and prepares segments for voice casting.
                </p>
              </div>

              <Tabs defaultValue="file" className="w-full max-w-[520px]">
                <TabsList
                  variant="button"
                  className="flex w-full gap-2 p-0"
                >
                  <TabsTrigger
                    value="file"
                    className="group/intake flex flex-1 shrink justify-start gap-[0.65rem] rounded-lg border border-ui-border bg-ui-bg-card px-4 py-3 text-left font-normal whitespace-normal text-ui-text-secondary transition-all [&_svg]:text-inherit hover:border-ui-border-strong hover:bg-ui-bg-hover hover:text-ui-text-primary data-[state=active]:border-ui-accent data-[state=active]:bg-ui-accent-soft data-[state=active]:text-ui-text-primary data-[state=active]:shadow-ui-ghost-inset"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ui-bg-surface text-ui-accent group-data-[state=active]/intake:bg-ui-accent-dim group-data-[state=active]/intake:text-white" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M9 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
                    </span>
                    <span className="flex flex-col gap-[0.1rem]">
                      <span className="text-[0.82rem] font-semibold leading-[1.2]">From file</span>
                      <span className="font-geist-mono text-[0.68rem] tracking-[0.02em] text-ui-text-muted">EPUB, PDF, or TXT</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="paste"
                    className="group/intake flex flex-1 shrink justify-start gap-[0.65rem] rounded-lg border border-ui-border bg-ui-bg-card px-4 py-3 text-left font-normal whitespace-normal text-ui-text-secondary transition-all [&_svg]:text-inherit hover:border-ui-border-strong hover:bg-ui-bg-hover hover:text-ui-text-primary data-[state=active]:border-ui-accent data-[state=active]:bg-ui-accent-soft data-[state=active]:text-ui-text-primary data-[state=active]:shadow-ui-ghost-inset"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ui-bg-surface text-ui-accent group-data-[state=active]/intake:bg-ui-accent-dim group-data-[state=active]/intake:text-white" aria-hidden="true">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="4" y="1" width="8" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/><rect x="2" y="3" width="12" height="12" rx="1" stroke="currentColor" strokeWidth="1.2"/><path d="M5 8h6M5 11h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    </span>
                    <span className="flex flex-col gap-[0.1rem]">
                      <span className="text-[0.82rem] font-semibold leading-[1.2]">Paste text</span>
                      <span className="font-geist-mono text-[0.68rem] tracking-[0.02em] text-ui-text-muted">Direct input</span>
                    </span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="file" className="mt-6">
                  <div className="w-full animate-[panelReveal_350ms_cubic-bezier(0.16,1,0.3,1)]">
                    <div className="flex flex-col items-center gap-[0.85rem] rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-card px-6 py-8 transition-[border-color] duration-200 focus-within:border-ui-accent">
                      <div className="mb-1 flex flex-col items-center gap-[0.35rem]">
                        <span className="text-ui-accent-dim opacity-65" aria-hidden="true">
                          <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M7 4h8l6 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M15 4v6h6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.5"/><path d="M14 15v5M12 18l2 2 2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </span>
                        <span className="font-geist-mono text-[0.8rem] tracking-[0.04em] text-ui-text-muted">Choose a book file</span>
                      </div>

                      <HisuiButton
                        variant="browse"
                        size="md"
                        icon={FolderIcon}
                        onClick={() => void props.onBrowse()}
                      >
                        Browse files
                      </HisuiButton>

                      <div className="flex w-full items-center gap-3">
                        <Separator className="h-px flex-1 bg-ui-border" />
                        <span className="font-geist-mono text-[0.7rem] uppercase tracking-[0.08em] text-ui-text-muted whitespace-nowrap">or type a path</span>
                        <Separator className="h-px flex-1 bg-ui-border" />
                      </div>

                      <label htmlFor="book-path" className="self-start font-geist-mono text-[0.75rem] uppercase tracking-[0.1em] text-ui-text-muted">File path</label>
                      <Input
                        id="book-path"
                        value={props.filePath}
                        onChange={(event) => props.setFilePath(event.target.value)}
                        placeholder="/Users/you/Books/story.epub"
                        className="text-center"
                      />
                      <div className="flex gap-[0.35rem]">
                        <Badge variant="outline" className="rounded-[3px] border-ui-border px-[0.4rem] py-[0.12rem] font-geist-mono text-[0.65rem] text-ui-text-muted">.epub</Badge>
                        <Badge variant="outline" className="rounded-[3px] border-ui-border px-[0.4rem] py-[0.12rem] font-geist-mono text-[0.65rem] text-ui-text-muted">.pdf</Badge>
                        <Badge variant="outline" className="rounded-[3px] border-ui-border px-[0.4rem] py-[0.12rem] font-geist-mono text-[0.65rem] text-ui-text-muted">.txt</Badge>
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
                  <div className="w-full animate-[panelReveal_350ms_cubic-bezier(0.16,1,0.3,1)]">
                    <div className="flex flex-col gap-3 rounded-lg border border-ui-border bg-ui-bg-card p-6">
                      <label className="flex flex-col gap-[0.3rem] text-left">
                        <span className="font-geist-mono text-[0.72rem] uppercase tracking-[0.1em] text-ui-text-muted">Title</span>
                        <Input
                          value={pasteTitle}
                          onChange={(event) => setPasteTitle(event.target.value)}
                          placeholder="My podcast script"
                          className="text-[0.9rem]"
                        />
                      </label>
                      <label className="flex flex-1 flex-col gap-[0.3rem] text-left">
                        <span className="font-geist-mono text-[0.72rem] uppercase tracking-[0.1em] text-ui-text-muted">Content</span>
                        <Textarea
                          className="max-h-[320px] min-h-[180px] resize-y text-[0.85rem] leading-[1.65] font-geist-sans"
                          value={pasteText}
                          onChange={(event) => setPasteText(event.target.value)}
                          placeholder="Paste your text here... Use blank lines to separate chapters or sections."
                        />
                      </label>
                      <div className="flex items-center justify-between gap-4">
                        <span className="font-geist-mono text-[0.7rem] text-ui-text-muted [font-variant-numeric:tabular-nums]" aria-label="Character count">
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
                <Alert variant="destructive" appearance="solid" className="mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
                  <AlertIcon><AlertCircle className="h-4 w-4" /></AlertIcon>
                  <AlertDescription>{props.importError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="mx-auto max-w-[580px] animate-[staggerReveal_500ms_cubic-bezier(0.16,1,0.3,1)] py-8">
              <p className={eyebrowClass}>Stage 01 - Book Intake</p>
              <h2 className="mb-[1.2rem] mt-[0.4rem] font-geist-pixel text-[clamp(1.4rem,2.5vw,2rem)]">Ready to begin</h2>

              <Card className="mb-5 rounded-md border border-ui-border bg-ui-bg-card p-5">
                <CardHeader className="mb-4 flex items-center gap-[0.65rem] p-0">
                  <Badge variant="outline" className="rounded-[3px] border-ui-accent-ghost-border bg-ui-accent-soft px-[0.5rem] py-[0.2rem] font-geist-mono text-[0.65rem] font-bold uppercase tracking-[0.06em] text-ui-accent">{props.importResult.sourceFormat.toUpperCase()}</Badge>
                  <h3 className="m-0 text-[1.1rem] font-semibold">{props.importResult.title}</h3>
                </CardHeader>
                <CardContent className="flex gap-8 p-0">
                  <div className="flex flex-col">
                    <span className="font-geist-mono text-[1.6rem] font-bold leading-[1.1] text-ui-text-primary [font-variant-numeric:tabular-nums]">{props.importResult.chapters.length}</span>
                    <span className="font-geist-mono text-[0.72rem] uppercase tracking-[0.08em] text-ui-text-muted">Chapters</span>
                  </div>
                </CardContent>

                {props.importResult.warnings.length > 0 ? (
                  <CardContent className="mt-3 border-t border-ui-border pt-3 px-0 pb-0">
                    {props.importResult.warnings.map((warning) => (
                      <p key={warning} className={warningTextClass}>{warning}</p>
                    ))}
                  </CardContent>
                ) : null}
              </Card>

              <div className="flex gap-[0.65rem]">
                <HisuiButton variant="primary" size="lg" onClick={() => void props.onCreateProject()}>
                  Create Project &amp; Continue
                </HisuiButton>
                <HisuiButton variant="ghost" onClick={() => void props.onImport()} disabled={props.importing}>
                  Re-import
                </HisuiButton>
              </div>

              {props.importError ? (
                <Alert variant="destructive" appearance="solid" className="mt-3 flex items-start gap-2 rounded border border-ui-error-soft-border bg-ui-error-soft px-[0.85rem] py-[0.65rem] text-[0.82rem] text-ui-error">
                  <AlertIcon><AlertCircle className="h-4 w-4" /></AlertIcon>
                  <AlertDescription>{props.importError}</AlertDescription>
                </Alert>
              ) : null}
            </div>
          )}
        </div>

        <aside className="flex max-h-[calc(100vh-44px-72px-3.3rem)] flex-col overflow-hidden rounded-[10px] border border-ui-border bg-ui-bg-card max-[1024px]:max-h-none" aria-label="Past creations">
          <div className="flex shrink-0 items-center justify-between px-[0.8rem] pt-[0.7rem]">
            <div className="flex items-center gap-[0.45rem]">
              <svg className="text-ui-accent opacity-70" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" opacity="0.4"/>
              </svg>
              <h3 className="m-0 text-[0.82rem] font-semibold tracking-[0.02em]">Library</h3>
              <span className="rounded-[8px] border border-ui-border bg-ui-bg-surface px-[0.4rem] py-[0.08rem] font-geist-mono text-[0.62rem] leading-[1.4] text-ui-text-muted">{props.projectHistory.length}</span>
            </div>
            <button
              className="grid place-items-center rounded-md border-0 bg-transparent p-[0.3rem] text-ui-text-muted transition-[color,background] duration-150 hover:bg-ui-bg-hover hover:text-ui-text-primary disabled:cursor-default disabled:opacity-40"
              onClick={() => void props.onRefreshProjectHistory()}
              disabled={props.projectHistoryLoading}
              aria-label="Refresh project list"
              title="Refresh"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={props.projectHistoryLoading ? "animate-spin" : ""}>
                <path d="M12 7a5 5 0 1 1-1-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M12 2v3h-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          <div className="shrink-0 px-[0.8rem] py-[0.5rem]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-auto rounded-[7px] border-ui-border bg-ui-bg-surface py-[0.38rem] pl-8 pr-8 font-inherit text-[0.72rem] focus:border-ui-accent-ghost-border focus:ring-2 focus:ring-ui-accent-soft-focus"
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
            <p className={warningTextClass} role="alert">{props.projectHistoryError}</p>
          ) : null}

          <ScrollArea className="flex-1 px-[0.5rem] pb-[0.6rem] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center gap-[0.4rem] px-4 py-8 text-center">
                {props.projectHistoryLoading ? (
                  <div className="flex items-center gap-2 text-[0.74rem] text-ui-text-muted">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <p>Loading projects...</p>
                  </div>
                ) : searchQuery ? (
                  <>
                    <p className="m-0 text-[0.78rem] font-[550] text-ui-text-secondary">No matches for &ldquo;{searchQuery}&rdquo;</p>
                    <button className="mt-1 rounded border-0 bg-transparent px-2 py-[0.2rem] text-[0.7rem] text-ui-accent hover:bg-ui-accent-soft" onClick={() => setSearchQuery("")}>Clear search</button>
                  </>
                ) : (
                  <>
                    <svg className="mb-1 text-ui-text-muted opacity-50" width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                      <rect x="6" y="4" width="20" height="24" rx="2" stroke="currentColor" strokeWidth="1.2" opacity="0.3"/>
                      <path d="M11 11h10M11 15h7M11 19h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.2"/>
                    </svg>
                    <p className="m-0 text-[0.78rem] font-[550] text-ui-text-secondary">No projects yet</p>
                    <p className="m-0 max-w-[200px] text-[0.68rem] leading-[1.5] text-ui-text-muted">Import a file to get started. Your creations will appear here.</p>
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
                  const isActive = props.selectedProjectHistoryId === item.id;
                  return (
                    <AccordionItem
                      key={item.id}
                      value={item.id}
                      className={cn(
                        "group/lh overflow-hidden rounded-lg border-b-0 [animation:panelReveal_0.25s_cubic-bezier(0.16,1,0.3,1)_both]",
                        isActive && "bg-ui-bg-hover"
                      )}
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <AccordionTrigger className={cn(
                        "w-full gap-0 rounded-lg px-0 py-0 text-inherit font-normal hover:bg-ui-bg-hover",
                        isActive && "bg-ui-bg-hover"
                      )}
                      >
                        <div
                          className={cn(
                            "my-[0.35rem] ml-[0.3rem] w-[3px] shrink-0 self-stretch rounded-[3px] bg-transparent transition-colors duration-200",
                            getFormatBarClass(item.sourceFormat, isActive)
                          )}
                          aria-hidden="true"
                        />
                        <div className="min-w-0 flex-1 px-[0.5rem] py-[0.45rem]">
                          <div className="flex items-center gap-[0.4rem]">
                            <span className="min-w-0 flex-1 truncate text-[0.78rem] font-[550] text-ui-text-primary">{item.title}</span>
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-[4px] bg-ui-frost-muted px-[0.32rem] py-[0.1rem] font-geist-mono text-[0.56rem] font-semibold tracking-[0.06em] text-ui-text-muted data-[format=epub]:bg-ui-format-epub-soft data-[format=epub]:text-ui-format-epub data-[format=pdf]:bg-ui-error-soft data-[format=pdf]:text-ui-format-pdf data-[format=txt]:bg-ui-format-txt-soft data-[format=txt]:text-ui-format-txt"
                              data-format={item.sourceFormat}
                            >
                              {item.sourceFormat.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="mt-[0.15rem] flex items-center gap-[0.3rem] font-geist-mono text-[0.64rem] text-ui-text-muted">
                            <span>{item.chapterCount} ch</span>
                            <span className="h-[2px] w-[2px] rounded-full bg-ui-text-muted opacity-50" aria-hidden="true" />
                            <span>{item.segmentCount} seg</span>
                            <span className="h-[2px] w-[2px] rounded-full bg-ui-text-muted opacity-50" aria-hidden="true" />
                            <span>{formatTimeAgo(item.updatedAt)}</span>
                          </div>
                        </div>
                      </AccordionTrigger>

                      <AccordionContent className="mx-[0.3rem] mt-0 border-t border-ui-border px-[0.8rem] pb-[0.6rem] pl-[1.3rem]">
                        {props.projectHistoryDetailsLoading ? (
                          <div className="flex items-center gap-[0.4rem] py-[0.4rem] text-[0.7rem] text-ui-text-muted">
                            <Skeleton className="h-3 w-3 rounded-full" />
                            <span>Loading...</span>
                          </div>
                        ) : selectedProject && isActive ? (
                          <>
                            <div className="flex flex-col gap-[0.2rem] pt-[0.4rem]">
                              <p className="m-0 text-[0.68rem] text-ui-text-secondary">
                                <span className="mr-[0.3rem] inline-block min-w-[3.4rem] font-geist-mono text-[0.58rem] uppercase tracking-[0.08em] text-ui-text-muted">Edited</span>
                                {formatAbsoluteDate(selectedProject.updatedAt)}
                              </p>
                              {selectedProject.sourcePath.trim() && (
                                <p className="m-0 truncate text-[0.68rem] text-ui-text-secondary" title={selectedProject.sourcePath}>
                                  <span className="mr-[0.3rem] inline-block min-w-[3.4rem] font-geist-mono text-[0.58rem] uppercase tracking-[0.08em] text-ui-text-muted">Source</span>
                                  {truncatePath(selectedProject.sourcePath)}
                                </p>
                              )}
                            </div>

                            <div className="mt-2 flex gap-[0.3rem]">
                              <Button variant="ghost" size="sm" className="inline-flex items-center gap-[0.28rem] rounded-md border border-ui-accent-ghost-border bg-ui-accent-soft px-[0.55rem] py-[0.28rem] text-[0.66rem] font-medium text-ui-accent hover:bg-ui-accent-soft-hover hover:text-ui-accent-hover" onClick={() => void props.onReworkSelectedProject()}>
                                <Pencil className="h-3 w-3" />
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="inline-flex items-center gap-[0.28rem] rounded-md border border-ui-border bg-ui-bg-surface px-[0.55rem] py-[0.28rem] text-[0.66rem] font-medium text-ui-text-secondary hover:border-ui-border-strong hover:bg-ui-bg-hover hover:text-ui-text-primary" onClick={() => void props.onOpenSelectedProjectInRender()}>
                                <Play className="h-3 w-3" />
                                Render
                              </Button>
                              {selectedProject.sourcePath.trim() ? (
                                <Button variant="ghost" size="sm" className="inline-flex items-center gap-[0.28rem] rounded-md border border-ui-border bg-ui-bg-surface px-[0.55rem] py-[0.28rem] text-[0.66rem] font-medium text-ui-text-secondary hover:border-ui-border-strong hover:bg-ui-bg-hover hover:text-ui-text-primary" onClick={() => void handleReveal(selectedProject.sourcePath)}>
                                  <FolderOpen className="h-3 w-3" />
                                  Reveal
                                </Button>
                              ) : null}
                            </div>

                            {scriptSnapshot ? (
                              <div className="mt-2 rounded-md border border-ui-border bg-ui-bg-surface px-[0.5rem] py-[0.4rem]">
                                <p className="inline-block font-geist-mono text-[0.58rem] uppercase tracking-[0.08em] text-ui-text-muted">Preview</p>
                                <pre className="m-0 mt-[0.2rem] max-h-[100px] overflow-hidden whitespace-pre-wrap text-[0.66rem] leading-[1.5] text-ui-text-secondary [mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_70%,transparent_100%)]">{scriptSnapshot}</pre>
                              </div>
                            ) : null}

                            {recentRenderJobs.length > 0 && (
                              <div className="mt-2 flex flex-col gap-1">
                                <p className="inline-block font-geist-mono text-[0.58rem] uppercase tracking-[0.08em] text-ui-text-muted">Renders</p>
                                {recentRenderJobs.slice(0, 3).map((job) => (
                                  <div key={job.id} className="flex items-center gap-[0.35rem] text-[0.64rem]">
                                    <Badge
                                      variant={job.state === "completed" ? "primary" : "outline"}
                                      className={cn(
                                        "rounded-[4px] bg-ui-bg-surface px-[0.3rem] py-[0.08rem] font-geist-mono text-[0.56rem] font-semibold uppercase tracking-[0.05em] text-ui-text-muted",
                                        job.state === "completed" && "bg-ui-success-soft-8 text-ui-success",
                                        job.state === "failed" && "bg-ui-error-soft text-ui-error",
                                        job.state === "running" && "bg-ui-accent-soft-focus text-ui-accent"
                                      )}
                                    >
                                      {job.state}
                                    </Badge>
                                    <span className="font-geist-mono text-ui-text-muted">{formatTimeAgo(job.finishedAt ?? job.startedAt ?? selectedProject.updatedAt)}</span>
                                    {job.outputMp3Path ? (
                                      <button className="ml-auto grid place-items-center rounded bg-transparent p-[0.15rem] text-ui-text-muted transition-[color,background] duration-150 hover:bg-ui-accent-soft hover:text-ui-accent" onClick={() => void handleReveal(job.outputMp3Path ?? "")}> 
                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5l3.5-3.5M4.5 1.5V5.5H8.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 7h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5"/></svg>
                                      </button>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}

                            {revealError ? <p className="m-0 text-[0.7rem] text-ui-warning" role="alert">{revealError}</p> : null}
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

function getFormatBarClass(format: string, isActive: boolean): string {
  if (format === "epub") {
    return isActive ? "bg-ui-format-epub opacity-100" : "group-hover/lh:bg-ui-format-epub group-hover/lh:opacity-40";
  }
  if (format === "pdf") {
    return isActive ? "bg-ui-format-pdf opacity-100" : "group-hover/lh:bg-ui-format-pdf group-hover/lh:opacity-40";
  }
  if (format === "txt") {
    return isActive ? "bg-ui-format-txt opacity-100" : "group-hover/lh:bg-ui-format-txt group-hover/lh:opacity-40";
  }
  return isActive ? "bg-ui-accent opacity-100" : "group-hover/lh:bg-ui-accent group-hover/lh:opacity-40";
}

function truncatePath(p: string): string {
  if (p.length <= 36) return p;
  const parts = p.split("/").filter(Boolean);
  if (parts.length <= 2) return `.../${parts[parts.length - 1]}`;
  return `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}
