import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BootstrapStatus,
  ImportResult,
  KokoroBackendMode,
  LlmPrepInput,
  Project,
  RenderJob,
  RenderOptions,
  SpeakerProfile,
  VoiceDefinition
} from "../../shared/types";
import { useTheme } from "../components/ThemeContext";
import { CasterNav } from "../components/CasterNav";
import { FolioNav } from "../components/FolioNav";
import { SettingsPanel } from "../components/SettingsPanel";
import { LibraryImportPanel } from "../components/LibraryImportPanel";
import { ScriptStudioPanel } from "../components/ScriptStudioPanel";
import { VoiceCastingPanel } from "../components/VoiceCastingPanel";
import { RenderDeskPanel } from "../components/RenderDeskPanel";
import { BootstrapSetupScreen } from "../components/BootstrapSetupScreen";

type View = "library" | "script" | "voices" | "render";
const DESKTOP_BRIDGE_ERROR =
  "Desktop bridge unavailable. Launch via Electron (`npm run dev`), not in a standalone browser tab.";

function extractTagsFromText(text: string): string[] {
  const matches = text.match(/\[([^\]]+)\]/g) ?? [];
  return matches.map((tag) => tag.slice(1, -1).trim().toLowerCase()).filter(Boolean);
}

function createDefaultSpeakers(voices: VoiceDefinition[]): SpeakerProfile[] {
  const narratorVoice = voices.find((voice) => voice.model === "kokoro") ?? voices[0];
  const altVoice = voices.find((voice) => voice.model === "chatterbox") ?? voices[1] ?? narratorVoice;

  if (!narratorVoice) {
    return [
      { id: crypto.randomUUID(), name: "Narrator", ttsModel: "kokoro", voiceId: "kokoro_narrator" }
    ];
  }

  return [
    { id: crypto.randomUUID(), name: "Narrator", ttsModel: narratorVoice.model, voiceId: narratorVoice.id },
    {
      id: crypto.randomUUID(),
      name: "Character A",
      ttsModel: altVoice?.model ?? narratorVoice.model,
      voiceId: altVoice?.id ?? narratorVoice.id
    }
  ];
}

export function App() {
  const { theme } = useTheme();
  const [view, setView] = useState<View>("library");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [voices, setVoices] = useState<VoiceDefinition[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [tagValidationMessage, setTagValidationMessage] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [llmPreview, setLlmPreview] = useState<{ original: string; prepared: string; changed: boolean } | null>(null);

  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [outputDir, setOutputDir] = useState("");
  const [outputFileName, setOutputFileName] = useState("podcast-output");
  const [speed, setSpeed] = useState(1);
  const [enableLlmPrep, setEnableLlmPrep] = useState(false);

  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [bootstrapInstallPath, setBootstrapInstallPath] = useState("");
  const [bootstrapBackend, setBootstrapBackend] = useState<KokoroBackendMode>("auto");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [bootstrapLoadError, setBootstrapLoadError] = useState<string | null>(null);
  const voicesLoadedRef = useRef(false);
  const selectionTouchedRef = useRef(false);

  const normalizeSelectedPackIds = (candidateIds: string[], status: BootstrapStatus): string[] => {
    const availableIds = new Set(status.modelPacks.map((pack) => pack.id));
    const requiredIds = status.modelPacks.filter((pack) => pack.required).map((pack) => pack.id);
    const selected = new Set<string>(requiredIds);

    for (const id of candidateIds) {
      if (availableIds.has(id)) {
        selected.add(id);
      }
    }

    return [...selected];
  };

  const applyBootstrapStatus = (next: BootstrapStatus) => {
    setBootstrapStatus(next);
    setBootstrapInstallPath(next.installPath);
    setBootstrapBackend(next.kokoroBackend);
    setSelectedPackIds((previous) => {
      if (selectionTouchedRef.current && previous.length > 0) {
        return normalizeSelectedPackIds(previous, next);
      }
      const installed = next.modelPacks.filter((pack) => pack.state === "installed").map((pack) => pack.id);
      const required = next.modelPacks.filter((pack) => pack.required).map((pack) => pack.id);
      const defaults = installed.length > 0 ? installed : required;
      return normalizeSelectedPackIds(defaults, next);
    });
  };

  const getDesktopApi = () => {
    if (!window.app) {
      throw new Error(DESKTOP_BRIDGE_ERROR);
    }
    return window.app;
  };

  const refreshBootstrapStatus = async () => {
    const status = await getDesktopApi().getBootstrapStatus();
    applyBootstrapStatus(status);
    setBootstrapLoadError(null);
    return status;
  };

  const loadVoices = async () => {
    try {
      const result = await getDesktopApi().listVoices();
      setVoices(result);
      setVoicesError(null);
    } catch (error) {
      setVoices([]);
      setVoicesError(error instanceof Error ? error.message : String(error));
    }
  };

  const startBootstrap = async (override?: { installPath?: string; backend?: KokoroBackendMode; selectedPackIds?: string[] }) => {
    const inputPath = override?.installPath ?? bootstrapInstallPath;
    const inputBackend = override?.backend ?? bootstrapBackend;
    const inputPacks = override?.selectedPackIds ?? selectedPackIds;

    const next = await getDesktopApi().startBootstrap({
      installPath: inputPath,
      kokoroBackend: inputBackend,
      selectedPackIds: inputPacks
    });
    applyBootstrapStatus(next);
    setBootstrapLoadError(null);
  };

  const browseBootstrapInstallPath = async () => {
    try {
      const selected = await getDesktopApi().showOpenDirectoryDialog(bootstrapInstallPath.trim() || undefined);
      if (selected) {
        setBootstrapInstallPath(selected);
      }
      return selected;
    } catch (error) {
      setBootstrapLoadError(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const useDefaultBootstrapInstallPath = () => {
    const defaultPath = bootstrapStatus?.defaultInstallPath?.trim();
    if (defaultPath) {
      setBootstrapInstallPath(defaultPath);
    }
  };

  useEffect(() => {
    if (!window.app) {
      setBootstrapLoadError(DESKTOP_BRIDGE_ERROR);
      return;
    }
    void refreshBootstrapStatus().catch((error) => {
      setBootstrapLoadError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  useEffect(() => {
    if (!bootstrapStatus || bootstrapStatus.phase !== "running") {
      return;
    }

    const interval = setInterval(() => {
      void refreshBootstrapStatus().catch((error) => {
        setBootstrapLoadError(error instanceof Error ? error.message : String(error));
      });
    }, 450);

    return () => clearInterval(interval);
  }, [bootstrapStatus]);

  useEffect(() => {
    if (!bootstrapStatus) {
      return;
    }

    if (bootstrapStatus.phase === "ready" && !voicesLoadedRef.current) {
      voicesLoadedRef.current = true;
      void loadVoices();
    }
  }, [bootstrapStatus]);

  useEffect(() => {
    if (!renderJob || (renderJob.state !== "queued" && renderJob.state !== "running")) {
      return;
    }

    const interval = setInterval(() => {
      void getDesktopApi().getRenderStatus(renderJob.id)
        .then((status) => {
          setRenderJob(status.job);
        })
        .catch((error) => {
          setRenderError(error instanceof Error ? error.message : String(error));
        });
    }, 1200);

    return () => clearInterval(interval);
  }, [renderJob]);

  const speakerList = useMemo(() => project?.speakers ?? createDefaultSpeakers(voices), [project, voices]);

  const importBook = async () => {
    setImportError(null);
    setImporting(true);
    try {
      const result = await getDesktopApi().importBook(filePath.trim());
      setImportResult(result);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const pasteImport = (title: string, text: string) => {
    const paragraphs = text.split(/\n{2,}/);
    const chapters: ImportResult["chapters"] = paragraphs
      .filter((p) => p.trim().length > 0)
      .map((p, i) => ({
        title: `Section ${i + 1}`,
        text: p.trim()
      }));

    if (chapters.length === 0) {
      setImportError("Pasted text is too short to create any sections.");
      return;
    }

    setImportResult({
      title,
      sourcePath: "(pasted text)",
      sourceFormat: "txt",
      chapters,
      warnings: chapters.length === 1
        ? ["Only one section detected. Use blank lines to separate chapters."]
        : []
    });
  };

  const createProject = async () => {
    if (!importResult) {
      return;
    }
    try {
      const api = getDesktopApi();
      const created = await api.createProject({
        title: importResult.title,
        sourcePath: importResult.sourcePath,
        sourceFormat: importResult.sourceFormat,
        chapters: importResult.chapters,
        speakers: createDefaultSpeakers(voices)
      });
      setProject(created);
      setOutputFileName(created.title);
      setView("script");
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error));
    }
  };

  const updateSegmentInState = (
    chapterId: string,
    segmentId: string,
    next: { text?: string; speakerId?: string; expressionTags?: string[] }
  ) => {
    if (!project) {
      return;
    }

    setProject({
      ...project,
      chapters: project.chapters.map((chapter) => (
        chapter.id === chapterId
          ? {
              ...chapter,
              segments: chapter.segments.map((segment) => (
                segment.id === segmentId
                  ? {
                      ...segment,
                      text: next.text ?? segment.text,
                      speakerId: next.speakerId ?? segment.speakerId,
                      expressionTags: next.expressionTags ?? (next.text ? extractTagsFromText(next.text) : segment.expressionTags)
                    }
                  : segment
              ))
            }
          : chapter
      ))
    });
  };

  const saveSegments = async () => {
    if (!project) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);

    try {
      const updates = project.chapters.flatMap((chapter) => chapter.segments.map((segment) => ({
        id: segment.id,
        speakerId: segment.speakerId,
        text: segment.text,
        expressionTags: segment.expressionTags
      })));
      const saved = await getDesktopApi().updateSegments({ projectId: project.id, updates });
      setProject(saved);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const validateTags = async (text: string) => {
    const result = await getDesktopApi().validateExpressionTags(text);
    if (result.isValid) {
      setTagValidationMessage("All expression tags are valid.");
      return;
    }
    setTagValidationMessage(`Invalid tags: ${result.invalidTags.join(", ")}. Supported: ${result.supportedTags.join(", ")}`);
  };

  const saveSpeakers = async () => {
    if (!project) {
      return;
    }

    setSaveState("saving");
    setSaveError(null);
    try {
      const saved = await getDesktopApi().updateSpeakers({
        projectId: project.id,
        speakers: project.speakers
      });
      setProject(saved);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };

  const browseOutputDirectory = async () => {
    try {
      const selected = await getDesktopApi().showOpenDirectoryDialog(outputDir.trim() || undefined);
      if (selected) {
        setOutputDir(selected);
        setRenderError(null);
      }
      return selected;
    } catch (err) {
      console.error("Failed to open directory dialog:", err);
      setRenderError("Could not open folder picker. Make sure the app is running in Electron.");
      return null;
    }
  };

  const runRender = async () => {
    if (!project) {
      return;
    }

    setRenderError(null);

    try {
      let renderOutputDir = outputDir.trim();
      if (!renderOutputDir) {
        renderOutputDir = (await browseOutputDirectory())?.trim() ?? "";
      }

      if (!renderOutputDir) {
        setRenderError("Choose an output directory before rendering.");
        setView("render");
        return;
      }

      const options: RenderOptions = {
        outputDir: renderOutputDir,
        outputFileName: outputFileName.trim(),
        speed,
        enableLlmPrep
      };
      const job = await getDesktopApi().renderProject(project.id, options);
      setRenderJob(job);
      setView("render");
    } catch (error) {
      setRenderError(error instanceof Error ? error.message : String(error));
    }
  };

  const cancelRender = async () => {
    if (!renderJob) {
      return;
    }
    await getDesktopApi().cancelRender(renderJob.id);
  };

  const runLlmPreview = async () => {
    if (!project) {
      return;
    }
    const first = project.chapters[0]?.segments[0];
    if (!first) {
      return;
    }
    const input: LlmPrepInput = { text: first.text };
    const result = await getDesktopApi().runOptionalLlmPrep(input);
    setLlmPreview({
      original: result.originalText,
      prepared: result.preparedText,
      changed: result.changed
    });
    setTagValidationMessage(result.changed ? "LLM prep preview changed text." : "LLM prep preview produced no change.");
  };

  if (!bootstrapStatus || bootstrapStatus.phase !== "ready") {
    const status = bootstrapLoadError && !bootstrapStatus
      ? {
          phase: "error",
          firstRun: true,
          defaultInstallPath: bootstrapInstallPath,
          installPath: bootstrapInstallPath,
          kokoroBackend: bootstrapBackend,
          step: "error",
          message: "Failed to read startup status.",
          percent: 0,
          bytesCopied: 0,
          bytesTotal: 0,
          modelPacks: [],
          error: bootstrapLoadError
        } satisfies BootstrapStatus
      : bootstrapStatus;

    return (
      <>
        <BootstrapSetupScreen
          status={status}
          defaultInstallPath={status?.defaultInstallPath ?? ""}
          installPath={bootstrapInstallPath}
          kokoroBackend={bootstrapBackend}
          selectedPackIds={selectedPackIds}
          onInstallPathChange={setBootstrapInstallPath}
          onBrowseInstallPath={() => {
            void browseBootstrapInstallPath();
          }}
          onUseDefaultInstallPath={useDefaultBootstrapInstallPath}
          onBackendChange={setBootstrapBackend}
          onTogglePack={(packId) => {
            selectionTouchedRef.current = true;
            setSelectedPackIds((previous) => {
              if (!bootstrapStatus) {
                return previous;
              }
              const requiredIds = bootstrapStatus.modelPacks.filter((pack) => pack.required).map((pack) => pack.id);
              const selected = new Set(previous);
              const isRequired = requiredIds.includes(packId);
              if (isRequired) {
                selected.add(packId);
              } else if (selected.has(packId)) {
                selected.delete(packId);
              } else {
                selected.add(packId);
              }
              for (const id of requiredIds) {
                selected.add(id);
              }
              return [...selected];
            });
          }}
          onStart={() => {
            void startBootstrap().catch((error) => {
              setBootstrapLoadError(error instanceof Error ? error.message : String(error));
            });
          }}
        />
        {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
      </>
    );
  }

  const workspaceContent = (
    <>
      {voicesError ? <p className="warning-text" role="alert">{voicesError}</p> : null}

      {llmPreview ? (
        <section className="panel llm-preview">
          <header className="panel-header">
            <div>
              <p className="eyebrow">Optional LLM Prep Preview</p>
              <h2>{llmPreview.changed ? "Diff Preview" : "No Change Detected"}</h2>
            </div>
          </header>
          <div className="llm-preview-grid">
            <article>
              <h3>Original</h3>
              <pre>{llmPreview.original}</pre>
            </article>
            <article>
              <h3>Prepared</h3>
              <pre>{llmPreview.prepared}</pre>
            </article>
          </div>
        </section>
      ) : null}

      {view === "library" ? (
        <LibraryImportPanel
          filePath={filePath}
          setFilePath={setFilePath}
          importResult={importResult}
          importing={importing}
          importError={importError}
          onImport={importBook}
          onBrowse={async () => {
            try {
              const selected = await getDesktopApi().showOpenFileDialog();
              if (selected) {
                setFilePath(selected);
              }
            } catch {
              /* bridge unavailable — user can still type path */
            }
          }}
          onPasteImport={pasteImport}
          onCreateProject={createProject}
        />
      ) : null}

      {view === "script" && project ? (
        <ScriptStudioPanel
          project={project}
          speakers={speakerList}
          saveState={saveState}
          saveError={saveError}
          onSegmentChange={updateSegmentInState}
          onSave={saveSegments}
          onValidate={validateTags}
          tagValidationMessage={tagValidationMessage}
        />
      ) : null}

      {view === "voices" && project ? (
        <VoiceCastingPanel
          speakers={project.speakers}
          voices={voices}
          onChange={(nextSpeakers) => {
            setProject({ ...project, speakers: nextSpeakers });
          }}
          onSave={saveSpeakers}
          saveState={saveState}
          saveError={saveError}
        />
      ) : null}

      {view === "render" && project ? (
        <RenderDeskPanel
          outputDir={outputDir}
          outputFileName={outputFileName}
          speed={speed}
          enableLlmPrep={enableLlmPrep}
          renderJob={renderJob}
          renderError={renderError}
          setOutputDir={setOutputDir}
          setOutputFileName={setOutputFileName}
          setSpeed={setSpeed}
          setEnableLlmPrep={setEnableLlmPrep}
          onBrowseOutputDir={browseOutputDirectory}
          onRender={runRender}
          onCancel={cancelRender}
        />
      ) : null}

      {!project && view !== "library" ? (
        <section className="panel empty-state">
          <div className="empty-state-inner">
            <span className="empty-state-icon" aria-hidden="true">&#9670;</span>
            <h3>No project yet</h3>
            <p>Import a book in the Library stage to get started.</p>
          </div>
        </section>
      ) : null}
    </>
  );
  return (
    <>
      <main className="app-shell">
        {theme === "caster" ? (
          <CasterNav
            view={view}
            onChange={setView}
            projectTitle={project?.title ?? ""}
            onOpenSettings={() => setSettingsOpen(true)}
            onLlmPreview={runLlmPreview}
          />
        ) : (
          <FolioNav
            view={view}
            onChange={setView}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        )}

        <div className="workspace">
          {workspaceContent}
        </div>
      </main>

      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </>
  );
}
