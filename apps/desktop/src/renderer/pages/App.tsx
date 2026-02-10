import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTheme } from "../components/ThemeContext";
import { HisuiNav } from "../components/HisuiNav";
import { FolioNav } from "../components/FolioNav";
import { SettingsPanel } from "../components/SettingsPanel";
import { LibraryImportPanel } from "../components/LibraryImportPanel";
import { ScriptStudioPanel } from "../components/ScriptStudioPanel";
import { VoiceCastingPanel } from "../components/VoiceCastingPanel";
import { RenderDeskPanel } from "../components/RenderDeskPanel";
import { BootstrapSetupScreen } from "../components/BootstrapSetupScreen";
import { useAppController } from "./useAppController";
import { resolveViewFromPathname, VIEW_PATHS, type View } from "./viewRouting";

function NoProjectState() {
  return (
    <section className="panel empty-state">
      <div className="empty-state-inner">
        <span className="empty-state-icon" aria-hidden="true">&#9670;</span>
        <h3>No project yet</h3>
        <p>Import a book in the Library stage to get started.</p>
      </div>
    </section>
  );
}

function LlmPreviewSection({
  original,
  prepared,
  changed
}: {
  original: string;
  prepared: string;
  changed: boolean;
}) {
  return (
    <section className="panel llm-preview">
      <header className="panel-header">
        <div>
          <p className="eyebrow">Optional LLM Prep Preview</p>
          <h2>{changed ? "Diff Preview" : "No Change Detected"}</h2>
        </div>
      </header>
      <div className="llm-preview-grid">
        <article>
          <h3>Original</h3>
          <pre>{original}</pre>
        </article>
        <article>
          <h3>Prepared</h3>
          <pre>{prepared}</pre>
        </article>
      </div>
    </section>
  );
}

export function App() {
  const { theme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const currentView = resolveViewFromPathname(location.pathname);

  const navigateToView = (view: View) => {
    const nextPath = VIEW_PATHS[view];
    if (location.pathname !== nextPath) {
      navigate(nextPath);
    }
  };

  const app = useAppController({
    currentView,
    navigateToView
  });

  if (!app.bootstrap.isReady) {
    return (
      <>
        <BootstrapSetupScreen
          status={app.bootstrap.status}
          defaultInstallPath={app.bootstrap.status?.defaultInstallPath ?? ""}
          installPath={app.bootstrap.installPath}
          kokoroBackend={app.bootstrap.backend}
          selectedPackIds={app.bootstrap.selectedPackIds}
          onInstallPathChange={app.bootstrap.setInstallPath}
          onBrowseInstallPath={() => {
            void app.bootstrap.browseInstallPath();
          }}
          onUseDefaultInstallPath={app.bootstrap.useDefaultInstallPath}
          onBackendChange={app.bootstrap.setBackend}
          onTogglePack={app.bootstrap.togglePack}
          onStart={() => {
            void app.bootstrap.start();
          }}
        />
        {app.settingsOpen ? (
          <SettingsPanel
            onClose={() => app.setSettingsOpen(false)}
            updateState={app.updateState}
            diagnostics={app.diagnostics}
            updateActionError={app.updateActionError}
            diagnosticsError={app.diagnosticsError}
            updateActionPending={app.updateActionPending}
            diagnosticsPending={app.diagnosticsPending}
            runtimeResourceSettings={app.runtimeResourceSettings}
            runtimeResourceDraft={app.runtimeResourceDraft}
            runtimeResourceDirty={app.runtimeResourceDirty}
            runtimeResourceSavePending={app.runtimeResourceSavePending}
            runtimeResourceSaveError={app.runtimeResourceSaveError}
            runtimeResourceSaveSuccess={app.runtimeResourceSaveSuccess}
            onRuntimeStrictWakeOnlyChange={app.setRuntimeStrictWakeOnly}
            onRuntimeIdleStopMinutesChange={app.setRuntimeIdleStopMinutes}
            onSaveRuntimeResourceSettings={app.saveRuntimeResourceSettings}
            onCheckForUpdates={app.checkForUpdates}
            onInstallDownloadedUpdate={app.installDownloadedUpdate}
            onRefreshDiagnostics={app.refreshDiagnostics}
            onRevealCrashDumps={app.revealCrashDumps}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <main className="app-shell">
        {theme === "hisui" ? (
          <HisuiNav
            view={currentView}
            onChange={navigateToView}
            projectTitle={app.project?.title ?? ""}
            onOpenSettings={() => app.setSettingsOpen(true)}
            onLlmPreview={app.runLlmPreview}
          />
        ) : (
          <FolioNav
            view={currentView}
            onChange={navigateToView}
            onOpenSettings={() => app.setSettingsOpen(true)}
          />
        )}

        <div className="workspace">
          {app.voicesError ? <p className="warning-text" role="alert">{app.voicesError}</p> : null}

          {app.llmPreview ? (
            <LlmPreviewSection
              original={app.llmPreview.original}
              prepared={app.llmPreview.prepared}
              changed={app.llmPreview.changed}
            />
          ) : null}

          <Routes>
            <Route path="/" element={<Navigate to={VIEW_PATHS.library} replace />} />
            <Route
              path={VIEW_PATHS.library}
              element={(
                <LibraryImportPanel
                  filePath={app.filePath}
                  setFilePath={app.setFilePath}
                  importResult={app.importResult}
                  importing={app.importing}
                  importError={app.importError}
                  onImport={app.importBook}
                  onBrowse={async () => {
                    await app.browseImportFile();
                  }}
                  onPasteImport={app.pasteImport}
                  onCreateProject={app.createProject}
                />
              )}
            />
            <Route
              path={VIEW_PATHS.script}
              element={app.project ? (
                <ScriptStudioPanel
                  project={app.project}
                  speakers={app.speakerList}
                  saveState={app.saveState}
                  saveError={app.saveError}
                  onSegmentChange={app.updateSegmentInState}
                  onSave={app.saveSegments}
                  onValidate={app.validateTags}
                  tagValidationMessage={app.tagValidationMessage}
                />
              ) : <NoProjectState />}
            />
            <Route
              path={VIEW_PATHS.voices}
              element={app.project ? (
                <VoiceCastingPanel
                  speakers={app.project.speakers}
                  voices={app.voices}
                  onChange={app.updateProjectSpeakers}
                  onPreview={app.previewVoice}
                  previewLoading={app.previewLoading}
                  previewPlaying={app.previewPlaying}
                  previewError={app.previewError}
                  onSave={app.saveSpeakers}
                  saveState={app.saveState}
                  saveError={app.saveError}
                />
              ) : <NoProjectState />}
            />
            <Route
              path={VIEW_PATHS.render}
              element={app.project ? (
                <RenderDeskPanel
                  projectTitle={app.project.title}
                  outputDir={app.outputDir}
                  outputFileName={app.outputFileName}
                  speed={app.speed}
                  enableLlmPrep={app.enableLlmPrep}
                  renderJob={app.renderJob}
                  renderError={app.renderError}
                  setOutputDir={app.setOutputDir}
                  setOutputFileName={app.setOutputFileName}
                  setSpeed={app.setSpeed}
                  setEnableLlmPrep={app.setEnableLlmPrep}
                  onBrowseOutputDir={app.browseOutputDirectory}
                  onRevealInFileManager={app.revealInFileManager}
                  onRender={app.runRender}
                  onCancel={app.cancelRender}
                />
              ) : <NoProjectState />}
            />
            <Route path="*" element={<Navigate to={VIEW_PATHS.library} replace />} />
          </Routes>
        </div>
      </main>

      {app.settingsOpen ? (
        <SettingsPanel
          onClose={() => app.setSettingsOpen(false)}
          updateState={app.updateState}
          diagnostics={app.diagnostics}
          updateActionError={app.updateActionError}
          diagnosticsError={app.diagnosticsError}
          updateActionPending={app.updateActionPending}
          diagnosticsPending={app.diagnosticsPending}
          runtimeResourceSettings={app.runtimeResourceSettings}
          runtimeResourceDraft={app.runtimeResourceDraft}
          runtimeResourceDirty={app.runtimeResourceDirty}
          runtimeResourceSavePending={app.runtimeResourceSavePending}
          runtimeResourceSaveError={app.runtimeResourceSaveError}
          runtimeResourceSaveSuccess={app.runtimeResourceSaveSuccess}
          onRuntimeStrictWakeOnlyChange={app.setRuntimeStrictWakeOnly}
          onRuntimeIdleStopMinutesChange={app.setRuntimeIdleStopMinutes}
          onSaveRuntimeResourceSettings={app.saveRuntimeResourceSettings}
          onCheckForUpdates={app.checkForUpdates}
          onInstallDownloadedUpdate={app.installDownloadedUpdate}
          onRefreshDiagnostics={app.refreshDiagnostics}
          onRevealCrashDumps={app.revealCrashDumps}
        />
      ) : null}
    </>
  );
}
