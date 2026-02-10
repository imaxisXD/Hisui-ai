import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BootstrapStatus,
  ImportResult,
  KokoroBackendMode,
  LlmPrepInput,
  Project,
  ProjectHistoryDetails,
  ProjectHistoryItem,
  RenderJob,
  RenderOptions,
  SpeakerProfile,
  TtsModel,
  RuntimeResourceSettings,
  UpdateRuntimeResourceSettingsInput,
  UpdateUiPreferencesInput,
  UpdateState,
  DiagnosticsSnapshot,
  VoicePreviewInput,
  VoiceDefinition
} from "../../shared/types";
import type { View } from "./viewRouting";

const DESKTOP_BRIDGE_ERROR =
  "Desktop bridge unavailable. Launch via Electron (`npm run dev`), not in a standalone browser tab.";
const DEFAULT_VOICE_PREVIEW_TEXT = "The lantern flickered once, and then the story began.";

interface ActiveVoicePreview {
  speakerId: string;
  model: TtsModel;
  voiceId: string;
  cacheKey: string;
}

interface UseAppControllerOptions {
  currentView: View;
  navigateToView: (view: View) => void;
}

interface AppControllerBootstrap {
  isReady: boolean;
  showStartupSplash: boolean;
  status: BootstrapStatus | null;
  autoStartEnabled: boolean;
  installPath: string;
  backend: KokoroBackendMode;
  selectedPackIds: string[];
  loadError: string | null;
  setInstallPath: (value: string) => void;
  setBackend: (value: KokoroBackendMode) => void;
  browseInstallPath: () => Promise<string | null>;
  useDefaultInstallPath: () => void;
  togglePack: (packId: string) => void;
  setAutoStartEnabled: (value: boolean) => Promise<void>;
  start: (override?: { installPath?: string; backend?: KokoroBackendMode; selectedPackIds?: string[] }) => Promise<void>;
}

interface AppControllerResult {
  settingsOpen: boolean;
  setSettingsOpen: (value: boolean) => void;
  project: Project | null;
  voices: VoiceDefinition[];
  voicesError: string | null;
  speakerList: SpeakerProfile[];
  llmPreview: { original: string; prepared: string; changed: boolean } | null;
  tagValidationMessage: string | null;
  saveState: "idle" | "saving" | "saved" | "error";
  saveError: string | null;
  runLlmPreview: () => Promise<void>;
  filePath: string;
  setFilePath: (value: string) => void;
  importResult: ImportResult | null;
  importing: boolean;
  importError: string | null;
  projectHistory: ProjectHistoryItem[];
  projectHistoryLoading: boolean;
  projectHistoryError: string | null;
  selectedProjectHistoryId: string | null;
  selectedProjectHistory: ProjectHistoryDetails | null;
  projectHistoryDetailsLoading: boolean;
  projectHistoryDetailsError: string | null;
  refreshProjectHistory: () => Promise<void>;
  selectProjectHistory: (projectId: string) => Promise<void>;
  reworkSelectedProject: () => Promise<void>;
  openSelectedProjectInRender: () => Promise<void>;
  openProjectFromHistory: (projectId: string) => Promise<void>;
  importBook: () => Promise<void>;
  browseImportFile: () => Promise<string | null>;
  pasteImport: (title: string, text: string) => void;
  createProject: () => Promise<void>;
  updateSegmentInState: (
    chapterId: string,
    segmentId: string,
    next: { text?: string; speakerId?: string; expressionTags?: string[] }
  ) => void;
  saveSegments: () => Promise<void>;
  validateTags: (text: string) => Promise<void>;
  updateProjectSpeakers: (nextSpeakers: SpeakerProfile[]) => void;
  previewLoading: ActiveVoicePreview | null;
  previewPlaying: ActiveVoicePreview | null;
  previewError: string | null;
  previewVoice: (input: { speakerId: string; model: TtsModel; voiceId: string }) => Promise<void>;
  saveSpeakers: () => Promise<void>;
  renderJob: RenderJob | null;
  renderError: string | null;
  outputDir: string;
  outputFileName: string;
  speed: number;
  enableLlmPrep: boolean;
  setOutputDir: (value: string) => void;
  setOutputFileName: (value: string) => void;
  setSpeed: (value: number) => void;
  setEnableLlmPrep: (value: boolean) => void;
  browseOutputDirectory: () => Promise<string | null>;
  revealInFileManager: (path: string) => Promise<void>;
  runRender: () => Promise<void>;
  cancelRender: () => Promise<void>;
  updateState: UpdateState | null;
  diagnostics: DiagnosticsSnapshot | null;
  updateActionPending: boolean;
  diagnosticsPending: boolean;
  updateActionError: string | null;
  diagnosticsError: string | null;
  checkForUpdates: () => Promise<void>;
  installDownloadedUpdate: () => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  revealCrashDumps: () => Promise<void>;
  runtimeResourceSettings: RuntimeResourceSettings | null;
  runtimeResourceDraft: UpdateRuntimeResourceSettingsInput;
  runtimeResourceDirty: boolean;
  runtimeResourceSavePending: boolean;
  runtimeResourceSaveError: string | null;
  runtimeResourceSaveSuccess: boolean;
  setRuntimeStrictWakeOnly: (value: boolean) => void;
  setRuntimeIdleStopMinutes: (minutes: number) => void;
  saveRuntimeResourceSettings: () => Promise<void>;
  bootstrap: AppControllerBootstrap;
}

function buildVoicePreviewCacheKey(input: VoicePreviewInput): string {
  return [input.model, input.voiceId, input.text.trim(), input.speed.toFixed(2)].join("::");
}

function decodeBase64Audio(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function extractTagsFromText(text: string): string[] {
  const matches = text.match(/\[([^\]]+)\]/g) ?? [];
  return matches.map((tag) => tag.slice(1, -1).trim().toLowerCase()).filter(Boolean);
}

function createDefaultSpeakers(voices: VoiceDefinition[]): SpeakerProfile[] {
  const narratorVoice = voices.find((voice) => voice.model === "kokoro") ?? voices[0];
  const altVoice = voices.find((voice) => voice.model === "chatterbox") ?? voices[1] ?? narratorVoice;

  if (!narratorVoice) {
    return [
      { id: crypto.randomUUID(), name: "Narrator", ttsModel: "kokoro", voiceId: "af_heart" }
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

function getDesktopApi() {
  if (!window.app) {
    throw new Error(DESKTOP_BRIDGE_ERROR);
  }
  return window.app;
}

function clampIdleStopMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(30, Math.round(value)));
}

function isRuntimeResourceDraftDirty(
  draft: UpdateRuntimeResourceSettingsInput,
  persisted: RuntimeResourceSettings | null
): boolean {
  if (!persisted) {
    return true;
  }
  return (
    draft.strictWakeOnly !== persisted.strictWakeOnly
    || clampIdleStopMinutes(draft.idleStopMinutes) !== persisted.idleStopMinutes
  );
}

function serializeUiPreferencesSignature(input: UpdateUiPreferencesInput): string {
  return JSON.stringify({
    outputDir: input.outputDir ?? "",
    outputFileName: input.outputFileName ?? "podcast-output",
    speed: input.speed ?? 1,
    enableLlmPrep: input.enableLlmPrep === true,
    selectedProjectHistoryId: input.selectedProjectHistoryId ?? null
  });
}

export function useAppController({ currentView, navigateToView }: UseAppControllerOptions): AppControllerResult {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [filePath, setFilePath] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [projectHistory, setProjectHistory] = useState<ProjectHistoryItem[]>([]);
  const [projectHistoryLoading, setProjectHistoryLoading] = useState(false);
  const [projectHistoryError, setProjectHistoryError] = useState<string | null>(null);
  const [selectedProjectHistoryId, setSelectedProjectHistoryId] = useState<string | null>(null);
  const [selectedProjectHistory, setSelectedProjectHistory] = useState<ProjectHistoryDetails | null>(null);
  const [projectHistoryDetailsLoading, setProjectHistoryDetailsLoading] = useState(false);
  const [projectHistoryDetailsError, setProjectHistoryDetailsError] = useState<string | null>(null);

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
  const [previewLoading, setPreviewLoading] = useState<ActiveVoicePreview | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState<ActiveVoicePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null);
  const [updateActionPending, setUpdateActionPending] = useState(false);
  const [diagnosticsPending, setDiagnosticsPending] = useState(false);
  const [updateActionError, setUpdateActionError] = useState<string | null>(null);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const [runtimeResourceSettings, setRuntimeResourceSettings] = useState<RuntimeResourceSettings | null>(null);
  const [runtimeResourceDraft, setRuntimeResourceDraft] = useState<UpdateRuntimeResourceSettingsInput>({
    strictWakeOnly: true,
    idleStopMinutes: 5
  });
  const [runtimeResourceDirty, setRuntimeResourceDirty] = useState(false);
  const [runtimeResourceSavePending, setRuntimeResourceSavePending] = useState(false);
  const [runtimeResourceSaveError, setRuntimeResourceSaveError] = useState<string | null>(null);
  const [runtimeResourceSaveSuccess, setRuntimeResourceSaveSuccess] = useState(false);

  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [bootstrapInstallPath, setBootstrapInstallPath] = useState("");
  const [bootstrapBackend, setBootstrapBackend] = useState<KokoroBackendMode>("auto");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [bootstrapLoadError, setBootstrapLoadError] = useState<string | null>(null);
  const [bootstrapAutoStarting, setBootstrapAutoStarting] = useState(false);
  const voicesLoadedRef = useRef(false);
  const selectionTouchedRef = useRef(false);
  const bootstrapAutoStartAttemptedRef = useRef(false);
  const lastBootstrapPhaseRef = useRef<BootstrapStatus["phase"] | null>(null);
  const lastRenderStateRef = useRef<RenderJob["state"] | null>(null);
  const outputDirInitializedRef = useRef(false);
  const runtimePromptOpenedRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewObjectUrlCacheRef = useRef<Map<string, string>>(new Map());
  const previewRequestTokenRef = useRef(0);
  const projectHistoryDetailsRequestRef = useRef(0);
  const uiPreferencesHydratedRef = useRef(false);
  const uiPreferencesSignatureRef = useRef("");

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

  const resolvePreferredPackSelection = (status: BootstrapStatus): string[] => {
    const installed = status.modelPacks.filter((pack) => pack.state === "installed").map((pack) => pack.id);
    const required = status.modelPacks.filter((pack) => pack.required).map((pack) => pack.id);
    const defaults = installed.length > 0 ? installed : required;
    return normalizeSelectedPackIds(defaults, status);
  };

  const applyBootstrapStatus = (next: BootstrapStatus) => {
    setBootstrapStatus(next);
    setBootstrapInstallPath(next.installPath);
    setBootstrapBackend(next.kokoroBackend);
    setSelectedPackIds((previous) => {
      if (selectionTouchedRef.current && previous.length > 0) {
        return normalizeSelectedPackIds(previous, next);
      }
      return resolvePreferredPackSelection(next);
    });
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

  const refreshProjectHistory = async () => {
    setProjectHistoryLoading(true);
    try {
      const items = await getDesktopApi().listProjects({ limit: 120 });
      setProjectHistory(items);
      setProjectHistoryError(null);
      const nextSelectedProjectId = selectedProjectHistoryId && items.some((item) => item.id === selectedProjectHistoryId)
        ? selectedProjectHistoryId
        : (items[0]?.id ?? null);

      if (!nextSelectedProjectId) {
        projectHistoryDetailsRequestRef.current += 1;
        setSelectedProjectHistoryId(null);
        setSelectedProjectHistory(null);
        setProjectHistoryDetailsError(null);
        setProjectHistoryDetailsLoading(false);
        return;
      }

      if (nextSelectedProjectId !== selectedProjectHistoryId) {
        await selectProjectHistory(nextSelectedProjectId);
      } else {
        await loadProjectHistoryDetails(nextSelectedProjectId);
      }
    } catch (error) {
      setProjectHistoryError(error instanceof Error ? error.message : String(error));
      setProjectHistory([]);
    } finally {
      setProjectHistoryLoading(false);
    }
  };

  const loadProjectHistoryDetails = async (projectId: string) => {
    const requestId = projectHistoryDetailsRequestRef.current + 1;
    projectHistoryDetailsRequestRef.current = requestId;
    setProjectHistoryDetailsLoading(true);
    setProjectHistoryDetailsError(null);
    try {
      const details = await getDesktopApi().getProjectHistoryDetails(projectId, 10);
      if (projectHistoryDetailsRequestRef.current !== requestId) {
        return;
      }
      setSelectedProjectHistory(details);
      if (!details) {
        setProjectHistoryDetailsError("Project not found.");
      }
    } catch (error) {
      if (projectHistoryDetailsRequestRef.current !== requestId) {
        return;
      }
      setSelectedProjectHistory(null);
      setProjectHistoryDetailsError(error instanceof Error ? error.message : String(error));
    } finally {
      if (projectHistoryDetailsRequestRef.current === requestId) {
        setProjectHistoryDetailsLoading(false);
      }
    }
  };

  const selectProjectHistory = async (projectId: string) => {
    if (!projectId.trim()) {
      projectHistoryDetailsRequestRef.current += 1;
      setSelectedProjectHistoryId(null);
      setSelectedProjectHistory(null);
      setProjectHistoryDetailsError(null);
      setProjectHistoryDetailsLoading(false);
      return;
    }
    setSelectedProjectHistoryId(projectId);
    await loadProjectHistoryDetails(projectId);
  };

  const openProjectFromHistory = async (projectId: string) => {
    const loaded = await getDesktopApi().getProject(projectId);
    if (!loaded) {
      throw new Error("Project not found.");
    }
    setProject(loaded);
    setOutputFileName(loaded.title);
    await selectProjectHistory(projectId);
    setImportResult(null);
  };

  const reworkSelectedProject = async () => {
    const projectId = selectedProjectHistoryId;
    if (!projectId) {
      return;
    }
    await openProjectFromHistory(projectId);
    navigateToView("script");
  };

  const openSelectedProjectInRender = async () => {
    const projectId = selectedProjectHistoryId;
    if (!projectId) {
      return;
    }
    await openProjectFromHistory(projectId);
    navigateToView("render");
  };

  const applyRuntimeResourceSettings = (
    next: RuntimeResourceSettings,
    options: { markClean: boolean } = { markClean: true }
  ) => {
    setRuntimeResourceSettings(next);
    setRuntimeResourceDraft({
      strictWakeOnly: next.strictWakeOnly,
      idleStopMinutes: clampIdleStopMinutes(next.idleStopMinutes)
    });
    if (options.markClean) {
      setRuntimeResourceDirty(false);
      setRuntimeResourceSaveSuccess(false);
    }
  };

  const refreshRuntimeResourceSettings = async (options: { preserveDraftWhenDirty: boolean } = { preserveDraftWhenDirty: true }) => {
    try {
      const next = await getDesktopApi().getRuntimeResourceSettings();
      if (options.preserveDraftWhenDirty && runtimeResourceDirty) {
        setRuntimeResourceSettings(next);
        return;
      }
      applyRuntimeResourceSettings(next);
      setRuntimeResourceSaveError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeResourceSaveError(message);
    }
  };

  const setRuntimeStrictWakeOnly = (value: boolean) => {
    setRuntimeResourceDraft((current) => {
      const next = {
        ...current,
        strictWakeOnly: value
      };
      setRuntimeResourceDirty(isRuntimeResourceDraftDirty(next, runtimeResourceSettings));
      return next;
    });
    setRuntimeResourceSaveError(null);
    setRuntimeResourceSaveSuccess(false);
  };

  const setRuntimeIdleStopMinutes = (minutes: number) => {
    const normalized = clampIdleStopMinutes(minutes);
    setRuntimeResourceDraft((current) => {
      const next = {
        ...current,
        idleStopMinutes: normalized
      };
      setRuntimeResourceDirty(isRuntimeResourceDraftDirty(next, runtimeResourceSettings));
      return next;
    });
    setRuntimeResourceSaveError(null);
    setRuntimeResourceSaveSuccess(false);
  };

  const saveRuntimeResourceSettings = async () => {
    setRuntimeResourceSavePending(true);
    try {
      const next = await getDesktopApi().updateRuntimeResourceSettings({
        strictWakeOnly: runtimeResourceDraft.strictWakeOnly,
        idleStopMinutes: clampIdleStopMinutes(runtimeResourceDraft.idleStopMinutes)
      });
      applyRuntimeResourceSettings(next);
      setRuntimeResourceSaveError(null);
      setRuntimeResourceSaveSuccess(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRuntimeResourceSaveError(message);
      setRuntimeResourceSaveSuccess(false);
    } finally {
      setRuntimeResourceSavePending(false);
    }
  };

  const startBootstrap = async (override?: { installPath?: string; backend?: KokoroBackendMode; selectedPackIds?: string[] }) => {
    const inputPath = override?.installPath ?? bootstrapInstallPath;
    const inputBackend = override?.backend ?? bootstrapBackend;
    const inputPacks = override?.selectedPackIds ?? selectedPackIds;

    try {
      const next = await getDesktopApi().startBootstrap({
        installPath: inputPath,
        kokoroBackend: inputBackend,
        selectedPackIds: inputPacks
      });
      applyBootstrapStatus(next);
      setBootstrapLoadError(null);
    } catch (error) {
      setBootstrapLoadError(error instanceof Error ? error.message : String(error));
      setBootstrapAutoStarting(false);
    }
  };

  const setBootstrapAutoStartEnabled = async (enabled: boolean) => {
    try {
      const next = await getDesktopApi().setBootstrapAutoStartEnabled(enabled);
      applyBootstrapStatus(next);
      setBootstrapLoadError(null);
    } catch (error) {
      setBootstrapLoadError(error instanceof Error ? error.message : String(error));
    }
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

  const toggleBootstrapPack = (packId: string) => {
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
  };

  useEffect(() => {
    if (!window.app) {
      setBootstrapLoadError(DESKTOP_BRIDGE_ERROR);
      return;
    }
    void (async () => {
      try {
        const status = await refreshBootstrapStatus();
        try {
          const preferences = await getDesktopApi().getUiPreferences();
          if (preferences.outputDir.trim()) {
            outputDirInitializedRef.current = true;
            setOutputDir(preferences.outputDir);
          }
          setOutputFileName(preferences.outputFileName);
          setSpeed(preferences.speed);
          setEnableLlmPrep(preferences.enableLlmPrep);
          if (preferences.selectedProjectHistoryId) {
            void selectProjectHistory(preferences.selectedProjectHistoryId);
          }
          uiPreferencesSignatureRef.current = serializeUiPreferencesSignature({
            outputDir: preferences.outputDir,
            outputFileName: preferences.outputFileName,
            speed: preferences.speed,
            enableLlmPrep: preferences.enableLlmPrep,
            selectedProjectHistoryId: preferences.selectedProjectHistoryId ?? null
          });
        } catch {
          uiPreferencesSignatureRef.current = serializeUiPreferencesSignature({
            outputDir: "",
            outputFileName: "podcast-output",
            speed: 1,
            enableLlmPrep: false,
            selectedProjectHistoryId: null
          });
        } finally {
          uiPreferencesHydratedRef.current = true;
        }

        if (
          status.phase === "awaiting-input"
          && !status.firstRun
          && status.autoStartEnabled
          && !bootstrapAutoStartAttemptedRef.current
        ) {
          bootstrapAutoStartAttemptedRef.current = true;
          setBootstrapAutoStarting(true);
          await startBootstrap({
            installPath: status.installPath,
            backend: status.kokoroBackend,
            selectedPackIds: resolvePreferredPackSelection(status)
          });
        }
      } catch (error) {
        setBootstrapLoadError(error instanceof Error ? error.message : String(error));
        uiPreferencesHydratedRef.current = true;
      }
    })();
    void refreshRuntimeResourceSettings({ preserveDraftWhenDirty: false });
    void refreshProjectHistory();
  }, []);

  useEffect(() => {
    if (!window.app || outputDirInitializedRef.current) {
      return;
    }
    outputDirInitializedRef.current = true;
    void getDesktopApi()
      .getDefaultRenderOutputDir()
      .then((defaultOutputDir) => {
        if (defaultOutputDir?.trim()) {
          setOutputDir(defaultOutputDir);
        }
      })
      .catch(() => {
        // Keep manual entry available even if default path lookup fails.
      });
  }, []);

  useEffect(() => {
    if (!window.app || !uiPreferencesHydratedRef.current) {
      return;
    }

    const payload: UpdateUiPreferencesInput = {
      outputDir,
      outputFileName,
      speed,
      enableLlmPrep,
      selectedProjectHistoryId: selectedProjectHistoryId ?? null
    };
    const nextSignature = serializeUiPreferencesSignature(payload);
    if (nextSignature === uiPreferencesSignatureRef.current) {
      return;
    }

    const timeout = setTimeout(() => {
      void getDesktopApi()
        .updateUiPreferences(payload)
        .then((saved) => {
          uiPreferencesSignatureRef.current = serializeUiPreferencesSignature({
            outputDir: saved.outputDir,
            outputFileName: saved.outputFileName,
            speed: saved.speed,
            enableLlmPrep: saved.enableLlmPrep,
            selectedProjectHistoryId: saved.selectedProjectHistoryId ?? null
          });
        })
        .catch(() => {
          // Leave in-memory state active even if persistence fails.
        });
    }, 200);

    return () => clearTimeout(timeout);
  }, [outputDir, outputFileName, speed, enableLlmPrep, selectedProjectHistoryId]);

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

    if (lastBootstrapPhaseRef.current !== bootstrapStatus.phase) {
      console.info("[bootstrap-status]", {
        phase: bootstrapStatus.phase,
        step: bootstrapStatus.step,
        percent: bootstrapStatus.percent,
        message: bootstrapStatus.message,
        error: bootstrapStatus.error
      });
      lastBootstrapPhaseRef.current = bootstrapStatus.phase;
    }

    if (bootstrapStatus.phase === "ready" && !voicesLoadedRef.current) {
      voicesLoadedRef.current = true;
      void loadVoices();
    }
    if (bootstrapStatus.phase === "ready" || bootstrapStatus.phase === "error" || bootstrapStatus.phase === "awaiting-input") {
      setBootstrapAutoStarting(false);
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
    }, 600);

    return () => clearInterval(interval);
  }, [renderJob]);

  useEffect(() => {
    if (!renderJob) {
      return;
    }
    if (lastRenderStateRef.current === renderJob.state) {
      return;
    }
    console.info("[render-status]", {
      id: renderJob.id,
      state: renderJob.state,
      errorText: renderJob.errorText,
      outputMp3Path: renderJob.outputMp3Path
    });
    if (renderJob.state === "completed" || renderJob.state === "failed" || renderJob.state === "canceled") {
      void refreshProjectHistory();
      if (selectedProjectHistoryId === renderJob.projectId) {
        void loadProjectHistoryDetails(renderJob.projectId);
      }
    }
    lastRenderStateRef.current = renderJob.state;
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

  const browseImportFile = async () => {
    try {
      const selected = await getDesktopApi().showOpenFileDialog();
      if (selected) {
        setFilePath(selected);
      }
      return selected;
    } catch {
      // Bridge unavailable: user can still paste/type a file path.
      return null;
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
      await selectProjectHistory(created.id);
      void refreshProjectHistory();
      navigateToView("script");
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
      void refreshProjectHistory();
      if (selectedProjectHistoryId === saved.id) {
        void loadProjectHistoryDetails(saved.id);
      }
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

  const updateProjectSpeakers = (nextSpeakers: SpeakerProfile[]) => {
    setProject((current) => (current ? { ...current, speakers: nextSpeakers } : current));
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
      void refreshProjectHistory();
      if (selectedProjectHistoryId === saved.id) {
        void loadProjectHistoryDetails(saved.id);
      }
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

  const revealInFileManager = async (path: string) => {
    try {
      await getDesktopApi().revealInFileManager(path);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRenderError(message);
      throw new Error(message);
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
        renderOutputDir = (await getDesktopApi().getDefaultRenderOutputDir())?.trim() ?? "";
      }
      if (!renderOutputDir) {
        renderOutputDir = (await browseOutputDirectory())?.trim() ?? "";
      }

      if (!renderOutputDir) {
        setRenderError("Choose an output directory before rendering.");
        navigateToView("render");
        return;
      }
      setOutputDir(renderOutputDir);

      const options: RenderOptions = {
        outputDir: renderOutputDir,
        outputFileName: outputFileName.trim(),
        speed,
        enableLlmPrep
      };
      const job = await getDesktopApi().renderProject(project.id, options);
      setRenderJob(job);
      if (selectedProjectHistoryId === project.id) {
        void loadProjectHistoryDetails(project.id);
      }
      navigateToView("render");
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

  const refreshUpdateState = async () => {
    try {
      const nextState = await getDesktopApi().getUpdateState();
      setUpdateState(nextState);
      setUpdateActionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateActionError(message);
    }
  };

  const checkForUpdates = async () => {
    setUpdateActionPending(true);
    try {
      const nextState = await getDesktopApi().checkForUpdates();
      setUpdateState(nextState);
      setUpdateActionError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateActionError(message);
    } finally {
      setUpdateActionPending(false);
    }
  };

  const installDownloadedUpdate = async () => {
    setUpdateActionPending(true);
    try {
      await getDesktopApi().installDownloadedUpdate();
      setUpdateActionError(null);
      await refreshUpdateState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setUpdateActionError(message);
    } finally {
      setUpdateActionPending(false);
    }
  };

  const refreshDiagnostics = async () => {
    setDiagnosticsPending(true);
    try {
      const snapshot = await getDesktopApi().getDiagnosticsSnapshot();
      setDiagnostics(snapshot);
      setDiagnosticsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDiagnosticsError(message);
    } finally {
      setDiagnosticsPending(false);
    }
  };

  const revealCrashDumps = async () => {
    const path = diagnostics?.crashDumpsPath?.trim();
    if (!path) {
      setDiagnosticsError("Crash dump path unavailable.");
      return;
    }
    try {
      await revealInFileManager(path);
      setDiagnosticsError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDiagnosticsError(message);
    }
  };

  const clearActivePreviewAudio = () => {
    const current = previewAudioRef.current;
    if (!current) {
      return;
    }
    current.pause();
    current.currentTime = 0;
    current.src = "";
    current.onended = null;
    current.onerror = null;
    previewAudioRef.current = null;
  };

  const stopVoicePreview = () => {
    previewRequestTokenRef.current += 1;
    clearActivePreviewAudio();
    setPreviewPlaying(null);
    setPreviewLoading(null);
  };

  const playVoicePreview = async (url: string, active: ActiveVoicePreview) => {
    clearActivePreviewAudio();
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    setPreviewPlaying(active);
    audio.onended = () => {
      if (previewAudioRef.current !== audio) {
        return;
      }
      previewAudioRef.current = null;
      setPreviewPlaying((current) => (current?.cacheKey === active.cacheKey ? null : current));
    };
    audio.onerror = () => {
      if (previewAudioRef.current === audio) {
        previewAudioRef.current = null;
      }
      setPreviewPlaying((current) => (current?.cacheKey === active.cacheKey ? null : current));
      setPreviewError("Voice preview playback failed.");
    };
    await audio.play();
  };

  const previewVoice = async (input: { speakerId: string; model: TtsModel; voiceId: string }) => {
    if (input.model !== "kokoro") {
      return;
    }

    const previewInput: VoicePreviewInput = {
      text: DEFAULT_VOICE_PREVIEW_TEXT,
      voiceId: input.voiceId,
      model: input.model,
      speed: Number.isFinite(speed) && speed > 0 ? speed : 1,
      expressionTags: []
    };
    const cacheKey = buildVoicePreviewCacheKey(previewInput);
    const nextActive: ActiveVoicePreview = {
      ...input,
      cacheKey
    };

    const isSameAsCurrent = previewPlaying
      && previewPlaying.speakerId === input.speakerId
      && previewPlaying.model === input.model
      && previewPlaying.voiceId === input.voiceId;
    if (isSameAsCurrent) {
      stopVoicePreview();
      return;
    }

    setPreviewError(null);
    const token = previewRequestTokenRef.current + 1;
    previewRequestTokenRef.current = token;
    setPreviewLoading(nextActive);

    try {
      let objectUrl = previewObjectUrlCacheRef.current.get(cacheKey);
      if (!objectUrl) {
        const result = await getDesktopApi().previewVoice(previewInput);
        if (previewRequestTokenRef.current !== token) {
          return;
        }
        const audioBytes = decodeBase64Audio(result.audioBase64);
        const blob = new Blob([audioBytes], { type: result.mimeType || "audio/wav" });
        objectUrl = URL.createObjectURL(blob);
        previewObjectUrlCacheRef.current.set(cacheKey, objectUrl);
      }

      if (previewRequestTokenRef.current !== token) {
        return;
      }
      await playVoicePreview(objectUrl, nextActive);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreviewError(message);
      setPreviewPlaying(null);
    } finally {
      setPreviewLoading((current) => (current?.cacheKey === nextActive.cacheKey ? null : current));
    }
  };

  useEffect(() => {
    return () => {
      clearActivePreviewAudio();
      for (const url of previewObjectUrlCacheRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      previewObjectUrlCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!project || !previewPlaying) {
      return;
    }
    const stillAvailable = project.speakers.some((speaker) => (
      speaker.id === previewPlaying.speakerId
      && speaker.ttsModel === previewPlaying.model
      && speaker.voiceId === previewPlaying.voiceId
    ));
    if (!stillAvailable) {
      stopVoicePreview();
    }
  }, [project, previewPlaying]);

  useEffect(() => {
    if (currentView !== "voices" && previewPlaying) {
      stopVoicePreview();
    }
  }, [currentView, previewPlaying]);

  useEffect(() => {
    if (!settingsOpen || !window.app) {
      return;
    }

    void refreshUpdateState();
    void refreshDiagnostics();
    void refreshRuntimeResourceSettings();
    void refreshProjectHistory();
  }, [settingsOpen]);

  useEffect(() => {
    if (runtimePromptOpenedRef.current) {
      return;
    }
    if (bootstrapStatus?.phase !== "ready") {
      return;
    }
    if (!runtimeResourceSettings?.promptPending) {
      return;
    }
    runtimePromptOpenedRef.current = true;
    setSettingsOpen(true);
  }, [bootstrapStatus?.phase, runtimeResourceSettings?.promptPending]);

  const bootstrapScreenStatus = useMemo<BootstrapStatus | null>(() => {
    if (bootstrapStatus) {
      if (!bootstrapLoadError) {
        return bootstrapStatus;
      }
      return {
        ...bootstrapStatus,
        phase: bootstrapStatus.phase === "running" ? "running" : "error",
        step: "error",
        message: "Failed to start runtime.",
        error: bootstrapLoadError
      };
    }

    if (!bootstrapLoadError) {
      return null;
    }

    return {
      phase: "error",
      firstRun: true,
      autoStartEnabled: true,
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
    };
  }, [bootstrapBackend, bootstrapInstallPath, bootstrapLoadError, bootstrapStatus]);

  return {
    settingsOpen,
    setSettingsOpen,
    project,
    voices,
    voicesError,
    speakerList,
    llmPreview,
    tagValidationMessage,
    saveState,
    saveError,
    runLlmPreview,
    filePath,
    setFilePath,
    importResult,
    importing,
    importError,
    projectHistory,
    projectHistoryLoading,
    projectHistoryError,
    selectedProjectHistoryId,
    selectedProjectHistory,
    projectHistoryDetailsLoading,
    projectHistoryDetailsError,
    refreshProjectHistory,
    selectProjectHistory,
    reworkSelectedProject,
    openSelectedProjectInRender,
    openProjectFromHistory,
    importBook,
    browseImportFile,
    pasteImport,
    createProject,
    updateSegmentInState,
    saveSegments,
    validateTags,
    updateProjectSpeakers,
    previewLoading,
    previewPlaying,
    previewError,
    previewVoice,
    saveSpeakers,
    renderJob,
    renderError,
    outputDir,
    outputFileName,
    speed,
    enableLlmPrep,
    setOutputDir,
    setOutputFileName,
    setSpeed,
    setEnableLlmPrep,
    browseOutputDirectory,
    revealInFileManager,
    runRender,
    cancelRender,
    updateState,
    diagnostics,
    updateActionPending,
    diagnosticsPending,
    updateActionError,
    diagnosticsError,
    checkForUpdates,
    installDownloadedUpdate,
    refreshDiagnostics,
    revealCrashDumps,
    runtimeResourceSettings,
    runtimeResourceDraft,
    runtimeResourceDirty,
    runtimeResourceSavePending,
    runtimeResourceSaveError,
    runtimeResourceSaveSuccess,
    setRuntimeStrictWakeOnly,
    setRuntimeIdleStopMinutes,
    saveRuntimeResourceSettings,
    bootstrap: {
      isReady: bootstrapStatus?.phase === "ready",
      showStartupSplash: bootstrapAutoStarting && bootstrapStatus?.phase !== "ready",
      status: bootstrapScreenStatus,
      autoStartEnabled: bootstrapStatus?.autoStartEnabled !== false,
      installPath: bootstrapInstallPath,
      backend: bootstrapBackend,
      selectedPackIds,
      loadError: bootstrapLoadError,
      setInstallPath: setBootstrapInstallPath,
      setBackend: setBootstrapBackend,
      browseInstallPath: browseBootstrapInstallPath,
      useDefaultInstallPath: useDefaultBootstrapInstallPath,
      togglePack: toggleBootstrapPack,
      setAutoStartEnabled: setBootstrapAutoStartEnabled,
      start: startBootstrap
    }
  };
}
