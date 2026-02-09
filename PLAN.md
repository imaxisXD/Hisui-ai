# Local Podcast Maker Execution Ledger

## Current milestone
- 2026-02-09T00:00:00Z: Phase 1 bootstrap completed.
- 2026-02-09T00:10:00Z: Phase 2 desktop foundation completed.
- 2026-02-09T00:28:00Z: Phase 3 ingestion + Phase 4 sidecar + UI baseline completed.
- 2026-02-09T00:42:00Z: Verification/hardening pass completed for static checks.
- 2026-02-09T00:48:00Z: Documentation and runtime guardrail pass completed.
- 2026-02-09T00:52:00Z: Expression-tag persistence patch completed.
- 2026-02-09T00:55:00Z: Optional LLM diff preview UI completed.
- 2026-02-09T00:58:00Z: Renderer TS module-resolution compatibility patch completed.
- 2026-02-09T01:00:00Z: Audio sidecar workspace metadata completed.
- 2026-02-09T01:12:00Z: Real `mlx-audio` sidecar synthesis integration completed.
- 2026-02-09T01:20:00Z: Verification resumed with live install/test/typecheck sweep.
- 2026-02-09T01:30:00Z: Packaging pipeline reached successful DMG build.
- 2026-02-09T01:45:00Z: Python sidecar environment + endpoint smoke tests completed.
- 2026-02-09T01:49:00Z: Final package revalidation completed after sidecar hardening.
- 2026-02-09T03:16:09Z: Finalization sprint started (mlx parity, offline cache hardening, signing config, integration flow tests).
- 2026-02-09T03:28:00Z: Strict-offline Python `mlx-audio` parity achieved for both Kokoro and Chatterbox.
- 2026-02-09T03:42:00Z: Optional Node Kokoro backend integrated (`kokoro-js`) and validated with Node 23 runtime.
- 2026-02-09T03:50:46Z: Post-integration verification and packaging revalidation completed.
- 2026-02-09T03:58:00Z: Electron runtime (`--run-as-node`) Node backend validation completed for Kokoro path.
- 2026-02-09T04:08:00Z: Async bootstrap refactor started (UI-first launch, in-app setup, model install progress, deferred sidecar start).
- 2026-02-09T04:22:00Z: Async bootstrap + first-run setup journey completed and revalidated (typecheck, tests, package).
- 2026-02-09T11:56:00Z: Hybrid model-manager implementation started (downloadable model packs + local reuse on subsequent launches).
- 2026-02-09T14:02:00Z: Hybrid model-manager delivered and validated (download-path tests, sample text-to-audio smoke, package revalidation).
- 2026-02-09T08:39:37Z: Dev-runtime defect triage started for preload bootstrap and renderer font decode failures.
- 2026-02-09T08:45:31Z: Preload/font runtime fixes completed and render merge hardening added (mixed WAV format normalization before MP3 encode).
- 2026-02-09T08:46:48Z: Renderer CSP baseline added to remove insecure-CSP warning while preserving local sidecar and dev-HMR connectivity.
- 2026-02-09T08:51:45Z: Renderer bridge-guard patch completed to handle missing preload bridge cleanly (`window.app` undefined) with actionable setup guidance.
- 2026-02-09T09:00:50Z: Preload sandbox-compat patch completed (self-contained preload IPC map, no shared-module runtime import) with dev-launch verification.
- 2026-02-09T09:05:50Z: Bundled model path resolver fix completed (`getWorkspaceRoot` dynamic discovery) to stop bootstrap from resolving `apps/resources/models` in dev.
- 2026-02-09T09:08:44Z: Runtime-state verification completed for first-run testing; confirmed default dev install path already has Kokoro pack installed.
- 2026-02-09T09:11:39Z: Sidecar Python runtime selection fix completed (prefer `services/audio/.venv/bin/python`) with fail-fast error surfacing for sidecar startup.
- 2026-02-09T09:12:49Z: Live dev-main verification completed; sidecar now boots successfully (`/health` + `/voices` 200) with venv-based Python runtime.
- 2026-02-09T09:15:49Z: Packaging portability audit completed; current bundled Python venv in DMG is not fully relocatable (interpreter symlink points to build-machine Homebrew path).

- 2026-02-09T09:45:00Z: Node-core runtime split implementation started (default no-Python startup; expressive Python sidecar only when optional pack selected).

- 2026-02-09T10:16:57Z: Node-core default runtime split delivered (`node-core` for required pack, `python-expressive` only when optional expressive pack selected), with workspace alignment to `@caster/desktop` and green quality gates.

- 2026-02-09T10:19:57Z: Packaging revalidation completed after Node-core runtime split; DMG rebuilt successfully as `apps/desktop/out/Caster-0.2.0-arm64.dmg`.

## Decisions
- Desktop runtime: Electron.
- Speech service: mlx-audio sidecar with MLX-first synthesis and deterministic fallback.
- Model delivery: bundled offline.
- v1 scope: import -> cast -> render (no timeline editor).
- LLM: optional preprocessing only.
- Platform: macOS Apple Silicon (`arm64`) only.
- Formats: EPUB, TXT, PDF.
- Voice slots: up to 6.
- Expression mode: manual tags.

## Findings
- Repository started empty and non-git; full monorepo skeleton created.
- Implemented Electron main/preload/renderer with typed IPC and context isolation.
- Added SQLite-backed persistence for projects, chapters, segments, speakers, and render jobs.
- Implemented ingestion pipeline for EPUB/TXT/PDF and sentence-preserving chunking.
- Implemented render pipeline: batch TTS -> WAV list -> ffmpeg concat -> MP3.
- Implemented Python sidecar endpoints: `/health`, `/tts`, `/batch-tts`, `/voices`, `/validate-tags`, `/llm-prep`.
- Added editorial-studio UI with 4 screens and responsive behavior.
- Added unit test scaffolding for chunking and expression tag validation.
- Runtime path handling corrected for ESM (`import.meta.url`) and workspace/resource resolution.
- Added render guardrails for missing output dir and ffmpeg fallback to system binary.
- Added runbook/checklist doc at `docs/SETUP_AND_PACKAGING.md`.
- Patched renderer state update so manual bracket tags from edited text persist into `expressionTags` on save.
- Added side-by-side LLM prep preview panel (original vs prepared text) before applying changes.
- Updated renderer TS config to `moduleResolution: Bundler` to avoid ESM extension friction in Vite frontend imports.
- Added `services/audio/package.json` for workspace consistency.
- Replaced sidecar stub-only path with `mlx-audio` model loading, per-model cache, local model directory preference, waveform writing, and automatic fallback to deterministic stub on runtime failure.
- Sidecar manager now prefers `python3.12`/`python3.13`/`python3.11` before `python3` and sets `LOCAL_PODCAST_MODELS_DIR` plus isolated `HF_HOME`.
- Added `misaki` dependency and updated docs because Kokoro loader requires it.
- Sidecar now enforces local-model-first behavior (no implicit remote model download unless explicit env override is set).
- Escalated `npm install` succeeded; toolchain is present.
- `npm run typecheck` passes.
- `npm run test` passes (6 tests).
- `npm run package` passes with escalated permissions; DMG and blockmap generated at `apps/desktop/out/Local Podcast Maker-0.1.0-arm64.dmg`.
- Python sidecar smoke test passed for `/health`, `/voices`, and `/batch-tts`, producing WAV files under `/tmp/local-podcast-smoke2`.
- Smoke test generated `engines: ["stub", "stub"]` because bundled model directories are still placeholders; this is expected until real models are placed in `resources/models/{kokoro,chatterbox}`.
- Reinstalled sidecar dependencies in `services/audio/.venv`; `misaki` + `num2words` now present and importable.
- Real-model smoke on `127.0.0.1:43111/batch-tts` now returns mixed engines: `["stub", "mlx-audio"]`.
- Kokoro fallback root cause is explicit: missing `spacy` dependency in sidecar runtime.
- Chatterbox runs on `mlx-audio` but still attempts Hugging Face network access for `S3TokenizerV2`; offline bundle needs pre-seeded HF cache.
- Added missing sidecar dependencies for Kokoro path compatibility: `spacy`, `phonemizer-fork`, `espeakng-loader`.
- Added sidecar cache seeding script at `services/audio/scripts/seed_offline_cache.py` and wired root script `npm run seed:offline-cache`.
- Corrected HF cache topology to include `.hf-cache/hub`, and set both `HF_HOME` + `HF_HUB_CACHE` for deterministic offline model resolution.
- Patched Kokoro voice resolution to prefer bundled local voice files (`resources/models/kokoro/voices/*.safetensors`) before HF repo lookup.
- Added signing/notarization wiring: `apps/desktop/scripts/notarize.cjs`, `afterSign` hook, and docs for Apple env vars.
- Added integration coverage `apps/desktop/src/main/pipeline.integration.test.ts` for import -> cast -> render output flow.
- Validation now passes: `npm run typecheck`, `npm run test` (7 tests), `npm run package` (DMG + blockmap generated).
- Strict-offline sidecar smoke now returns `engines: ["mlx-audio","mlx-audio"]` for mixed Kokoro + Chatterbox payloads.
- Added optional Node Kokoro backend workspace at `services/kokoro-node` with CLI + cache warmup script.
- Sidecar now supports backend mode env: `LOCAL_PODCAST_KOKORO_BACKEND=auto|node|node-first|node-fallback`.
- Node Kokoro direct/sidecar validation succeeds when using Node 23 runtime (`/Users/abhishekmac/.nvm/versions/node/v23.11.0/bin/node`), producing `engines: ["kokoro-node"]`.
- Node backend initially failed due missing `sharp` runtime package; resolved by installing `@img/sharp-darwin-arm64` using Node 23 toolchain.
- Confirmed shell-node mismatch source: this environment resolves `/usr/local/bin/node` (v18.15.0) before NVM path; explicit Node 23 binary path avoids ambiguity.
- Confirmed app-style Electron runtime path (`Electron --run-as-node`) now also returns `engines: ["kokoro-node"]` after sharp runtime fix.
- Startup currently blocks on sidecar launch in `main.ts`; onboarding cannot show progress before sidecar is ready.
- Existing IPC surface has no bootstrap channels; renderer currently calls `listVoices` immediately on mount.
- Added `BootstrapManager` at `apps/desktop/src/main/bootstrap/bootstrapManager.ts` to persist setup config, copy bundled models to user-selected install path, and start sidecar asynchronously.
- Added bootstrap IPC surface (`app:get-bootstrap-status`, `app:start-bootstrap`) and preload bridge methods for renderer-driven startup orchestration.
- `main.ts` now launches UI first and no longer blocks on sidecar startup; sidecar is started only after bootstrap trigger from UI.
- Added first-run setup screen `apps/desktop/src/renderer/components/BootstrapSetupScreen.tsx` with install path/backend inputs and progress bar (bytes + percent).
- Renderer app now gates production panels behind bootstrap readiness and auto-starts services for returning users using persisted setup values.
- Added bootstrap lifecycle test `apps/desktop/src/main/bootstrap/bootstrapManager.test.ts` covering first run, async progress completion, file copy, and persisted state reload.
- Revalidated build quality after startup refactor: `npm run typecheck`, `npm run test` (8 tests), `npm run package` all pass.
- Next iteration target: Handy-style model selection + download/install flow with persistent local runtime and no re-download after first successful install.
- Implemented Handy-style hybrid bootstrap manager with selectable model packs, remote download support, bundled fallback, and persisted installed-pack state.
- Bootstrap contracts now include pack selection input and per-pack status output (`selectedPackIds`, `modelPacks`) for renderer-driven onboarding.
- Setup UI now supports model pack selection, per-pack status/progress, and required-pack enforcement before starting services.
- Added dedicated remote-download unit coverage by serving a tarball over local HTTP and validating install into runtime `models` path.
- Full validation after hybrid rollout: `npm run typecheck`, `npm run test` (9 tests), and `npm run package` all pass.
- Real synthesis smoke passed: live sidecar generated WAV files via `/batch-tts` and produced MP3 at `/tmp/local-podcast-hybrid-e2e/sample.mp3`.
- Electron preload runtime failure reproduced: built preload emitted ESM (`import ... from "electron"`), which caused `Cannot use import statement outside a module` at app launch.
- Renderer font decode failure reproduced: `@font-face` URLs targeted `../../../../resources/fonts/*`, which resolves incorrectly in Vite dev server and produced OTS `invalid sfntVersion`.
- Added real font assets to both renderer public path (`apps/desktop/src/renderer/public/fonts`) and packaged resources path (`resources/fonts`).
- Switched renderer `@font-face` URLs to `/fonts/*` so Vite serves valid TTF assets in development and build output.
- Updated preload TS config to compile as CommonJS (`module: CommonJS`, `moduleResolution: Node`) for Electron preload compatibility.
- Rebuilt desktop app after preload patch; generated preload now uses `require(...)` and no top-level ESM imports.
- End-to-end mixed-engine synth smoke succeeded at `/tmp/local-podcast-e2e-smoke16` with engines `["kokoro-node","mlx-audio"]`.
- Raw concat->MP3 path can fail on mixed float/pcm WAV inputs (observed `libmp3lame` assertion in local ffmpeg run); render service now normalizes to `s16/44100/mono` via ffmpeg `aformat` before encoding.
- Final sample MP3 produced at `/tmp/local-podcast-e2e-smoke16/sample.mp3` after normalization workflow.
- Added renderer CSP meta policy in `apps/desktop/src/renderer/index.html` to constrain script/font/media/connect origins and eliminate insecure-CSP warning in normal runs.
- Confirmed new bootstrap error screenshot root cause: renderer can run without Electron preload (for example, standalone Vite tab), resulting in `window.app` undefined.
- Added explicit desktop-bridge guard in renderer app logic so startup shows actionable error text instead of raw `Cannot read properties of undefined`.
- Setup CTA is now disabled when desktop bridge is unavailable to prevent noisy retry failures.
- Updated renderer global typing to `window.app?: DesktopApi` to match real runtime behavior during browser-only dev sessions.
- Identified preload fragility in sandbox mode: preload runtime import of `../shared/ipc.js` can fail and prevent `contextBridge.exposeInMainWorld`.
- Made preload self-contained with inline IPC channel constants so generated preload requires only Electron module runtime.
- Added main-process `preload-error` listener to surface preload failures in terminal logs immediately.
- Updated `dev:main` wait target to `tcp:127.0.0.1:5173` to avoid intermittent `wait-on` hangs when renderer dev server is already up.
- Verified fresh `npm run dev -w @local-podcast/desktop` startup reaches build-main/build-preload and Electron launch without preload-error logs.
- New setup failure root cause confirmed from screenshot/error text: bundled model source resolved to `/Users/abhishekmac/Desktop/Hobby Projects/local-podcast/apps/resources/models/kokoro` due incorrect workspace root depth in built path utilities.
- Replaced fixed-depth `getWorkspaceRoot` with dynamic upward discovery based on repo markers (`package.json`, `apps`, `services`, `resources`) so dev and built layouts resolve the same repo root.
- Added regression test coverage for path utilities at `apps/desktop/src/main/utils/paths.test.ts`.
- Verified local onboarding state on current machine: `~/Library/Application Support/Electron/offline-runtime/models/kokoro` and `kokoro-node-cache` already exist; first-run bootstrap behavior will not trigger unless using a fresh install path or clearing this runtime folder.
- New bootstrap failure root cause from latest logs: sidecar was launched with a global Python missing dependencies (`ModuleNotFoundError: No module named 'fastapi'`), so health check timed out at 92%.
- Updated sidecar startup to prefer the project-local interpreter at `services/audio/.venv/bin/python` before global Python discovery.
- Added fail-fast sidecar health behavior: if process exits before health checks pass, bootstrap now returns captured stderr details instead of generic timeout-only messaging.
- Live process check confirms fix: `npm run dev:main -w @local-podcast/desktop` starts sidecar, emits Uvicorn startup, and serves `GET /health` + `POST /voices` successfully.
- DMG audit finding: `Local Podcast Maker.app/Contents/Resources/services/audio/.venv/bin/python3.12` is a symlink to `/opt/homebrew/opt/python@3.12/bin/python3.12`; end-users without matching Python path can still fail even though venv folder is bundled.
- Confirmed packaged venv imports (`fastapi`, `uvicorn`, `mlx_audio`) on build machine, but portability is currently accidental and tied to local Homebrew Python presence.

- Web validation confirms there is no official `mlx-audio` Node package (`npm view mlx-audio version` returns 404); upstream MLX-Audio remains Python-first (`pip install mlx-audio`) with optional Swift integration, not npm delivery.
- Node-friendly local TTS alternatives with active distribution exist: `kokoro-js` (ONNX/Transformers.js, Node CPU mode documented) and `sherpa-onnx`/`sherpa-onnx-node` (offline TTS/STT npm packages with Node install docs and no Python preinstall requirement).
- Expressive paralinguistic tags (`[laugh]`, `[cough]`) remain strongly tied to Chatterbox-Turbo, whose official install path is still Python (`pip install chatterbox-tts`); no official Node package is documented.
- Piper as a primary fallback is high-risk for this project lifecycle: original `rhasspy/piper` repo is archived and has recurring macOS arm64 packaging reports; if we use Piper voices, prefer serving them through maintained `sherpa-onnx` artifacts instead of direct Piper runtime binaries.

- npm registry check confirms current alternative package versions: `sherpa-onnx@1.12.23`, `sherpa-onnx-node@1.12.23`, and `kokoro-js@1.2.1` (validated locally via `npm view`).

- Implementation objective locked: startup/render path must work without Python when only required `kokoro-core` pack is selected; Python sidecar is now reserved for optional expressive pack selection.

- User-confirmed workspace package rename to `@caster/desktop`; root workspace scripts now target the renamed package to restore `npm run {typecheck,test,build}` flows.
- Added `NodeKokoroClient` (`apps/desktop/src/main/sidecars/nodeKokoroClient.ts`) and introduced runtime-client abstraction so core narration can run without Python sidecar startup.
- `AudioSidecarManager` now supports runtime modes: `node-core` (no Python process) and `python-expressive` (launch Python sidecar for Chatterbox/MLX path).
- Bootstrap now derives runtime mode from selected packs: required-only (`kokoro-core`) => `node-core`; selecting `chatterbox-expressive` => `python-expressive`.
- Voice casting model dropdown is now runtime-aware and only shows models currently available from active runtime voices.
- First-run pack defaults now select required packs only; optional expressive pack is no longer auto-selected.
- Remote-pack bootstrap test no longer opens local HTTP listener (sandbox EPERM); it now mocks `fetch` with an in-memory tarball response.
- Node-core smoke succeeded with Node 23 runtime: generated WAV `/tmp/local-podcast-nodecore-smoke/seg1.wav` and MP3 `/tmp/local-podcast-nodecore-smoke/sample.mp3` without Python sidecar.
- Node 18 direct Kokoro CLI remains unreliable in this env (`ERR_INVALID_ARG_TYPE` from `kokoro-js`); runtime defaults remain tuned for Electron `--run-as-node` or explicit Node 23 path.
- Updated node-flag inference so non-node binaries default to `--run-as-node`, preserving packaged Electron runtime behavior for Node backend execution.

- Post-split packaging pass succeeds with renamed desktop package (`@caster/desktop`), producing `apps/desktop/out/Caster-0.2.0-arm64.dmg` and blockmap.

## Risks
- Packaging currently skips signing/notarization because no Developer ID identity is configured.
- Node backend viability depends on runtime-compatible `sharp` binaries; when using non-default runtimes, install matching platform runtime packages.
- Single-installer guarantee is not fully closed until Python runtime + dependencies are bundled (current build still expects host Python environment).
- Node backend offline-first behavior depends on seeded `resources/models/kokoro-node-cache` before shipping.
- Model install copy cost on first run can feel slow without explicit progress; user journey requires visible progress UI.
- Manual clean-machine UX walkthrough is still required to confirm perceived setup time and copy progress behavior against large real model bundles.
- Remote model hosting URLs/catalog must be configured for production internet downloads; fallback path uses bundled packs for local development.

## Command log
- Initial discovery: `pwd && ls -la`, `rg --files`, `git rev-parse --is-inside-work-tree`.
- JS toolchain: `npm install`, `npm run typecheck`, `npm run test`, `npm run package`.
- Python toolchain: created `services/audio/.venv` with `python3.12`, installed `services/audio/requirements.txt`.
- Sidecar smoke checks: started server on `127.0.0.1:43111`, validated `/health`, `/voices`, `/batch-tts`, and verified WAV outputs in `/tmp/local-podcast-smoke2`.
- Follow-up sidecar checks: refreshed `pip install -r services/audio/requirements.txt`, restarted sidecar, ran elevated `/health` + `/batch-tts` on `/tmp/local-podcast-smoke3`.
- Cache hardening: executed `services/audio/scripts/seed_offline_cache.py` against `resources/models` (with escalated network).
- Kokoro dependency fixes: iteratively installed `spacy`, `phonemizer-fork`, `espeakng-loader`; reran strict-offline smoke at `/tmp/local-podcast-smoke4..10`.
- Node backend validation: installed `kokoro-js`, patched sidecar node backend execution path, installed `@img/sharp-darwin-arm64` via Node 23 npm, and verified `/tmp/local-podcast-smoke13`.
- Electron-node validation: executed node-first sidecar with `Electron --run-as-node`, validated `/tmp/local-podcast-smoke14` -> `engines: ["kokoro-node"]`.
- Final quality gates: reran `npm run typecheck`, `npm run test`, `npm run package`.
- Async bootstrap discovery: inspected `main.ts`, IPC/preload bridge, renderer `App.tsx`, and current onboarding gaps.
- Async bootstrap implementation: added bootstrap manager + IPC/preload/API wiring + renderer setup/progress screen, then reran `npm run typecheck`.
- Startup verification: reran `npm run test` (4 files / 8 tests, includes new bootstrap test).
- Packaging verification after startup refactor: reran `npm run package` and rebuilt arm64 DMG/blockmap.
- Hybrid implementation discovery: verified current `resources/models` footprint and sidecar model path requirements (`kokoro`, `chatterbox`, `.hf-cache`).
- Hybrid implementation pass: rewrote `bootstrapManager` for model-pack download/install states and updated renderer onboarding controls for pack selection.
- Hybrid verification: ran targeted bootstrap test file (includes remote HTTP pack test), then full `npm run test` and `npm run typecheck`.
- Sample text-to-audio flow: started sidecar in strict-offline mode, verified `/health` + `/voices`, synthesized two segments via `/batch-tts`, merged to MP3 with ffmpeg.
- Final package verification: reran `npm run package` and rebuilt `apps/desktop/out/Local Podcast Maker-0.1.0-arm64.dmg`.
- Dev-runtime triage: inspected `apps/desktop/dist/preload/preload/preload.js`, `apps/desktop/tsconfig.preload.json`, `apps/desktop/src/renderer/styles/app.css`, and font directories.
- Applied preload+font fixes and validated file presence with `ls` and `sed` inspections.
- Post-fix quality gates: reran `npm run typecheck`, `npm run test` (9 tests), and `npm run package` successfully.
- End-to-end smoke: restarted sidecar with hybrid backend (`node-first` + MLX enabled), synthesized mixed Kokoro+Chatterbox payload via `/batch-tts`, and verified output WAV paths.
- MP3 merge validation: confirmed ffmpeg one-pass normalization command works for mixed WAV sample formats and updated render pipeline accordingly.
- CSP hardening verification: rebuilt desktop renderer/main/preload with updated CSP meta tag and confirmed build output generation.
- Bridge-guard verification: reran `npm run typecheck`, `npm run test` (9 tests), and `npm run build -w @local-podcast/desktop`; all pass.
- Preload hardening verification: reran `npm run build:preload -w @local-podcast/desktop` and confirmed `dist/preload/preload/preload.js` has no `require(\"../shared/ipc.js\")`.
- Dev command verification: reran `npm run dev -w @local-podcast/desktop` and confirmed main-process compile + launch sequence starts cleanly.
- Post-patch quality gates: reran `npm run typecheck` and `npm run test` (9 tests); both pass.
- Path resolver fix pass: patched `apps/desktop/src/main/utils/paths.ts`, added `apps/desktop/src/main/utils/paths.test.ts`, reran `npm run typecheck` and `npm run test` (11 tests); both pass.
- Runtime state check: inspected `~/Library/Application Support/Electron/offline-runtime` and model subfolders to confirm preinstalled required pack presence.
- Sidecar runtime fix pass: patched `apps/desktop/src/main/sidecars/audioSidecarManager.ts`, reran `npm run typecheck` and `npm run test` (11 tests); both pass.
- Runtime verification pass: launched `dev:main` against active renderer server; observed sidecar startup and successful health/voice requests in terminal output.
- Packaging runtime audit: inspected packaged app resources and sidecar venv interpreter links; validated current non-relocatable interpreter link target.

- Web research pass: verified `mlx-audio` distribution model (GitHub + PyPI), checked npm registry (`npm view mlx-audio version`), and compared Node-capable offline TTS options (`kokoro-js`, `sherpa-onnx`, `sherpa-onnx-node`) plus expressive-model constraints from official Chatterbox docs.

- Registry verification: `npm view mlx-audio version` (404 not found), `npm view sherpa-onnx version`, `npm view sherpa-onnx-node version`, and `npm view kokoro-js version` to confirm Node-deliverable alternatives.

- Implementation kickoff: audited bootstrap + sidecar + renderer model-selection flows to enforce Node-core default startup and optional expressive sidecar activation.

- Workspace alignment + validation pass: `rg -n "@local-podcast/desktop|@caster/desktop"`, patched root `package.json` scripts, then ran `npm run typecheck`, `npm run test`, and `npm run build` against `@caster/desktop`.
- Runtime split implementation pass: added `nodeKokoroClient.ts`, patched `audioSidecarManager.ts`, `bootstrapManager.ts`, `VoiceCastingPanel.tsx`, and `App.tsx`; revalidated with typecheck/tests.
- Node-core audio smoke: ran `node services/kokoro-node/cli.mjs` (Node 23 explicit binary) to synthesize WAV and converted to MP3 with ffmpeg under `/tmp/local-podcast-nodecore-smoke`.

- Packaging revalidation pass: `npm run package` now targets `@caster/desktop` and produced `apps/desktop/out/Caster-0.2.0-arm64.dmg` plus blockmap.

## Next actions
1. Add runtime capability metadata to bootstrap/renderer state so UI can clearly badge "Core (No Python)" vs "Expressive (Python)" in setup and casting screens.
2. Implement relocatable packaging for optional expressive runtime (private embedded Python + deps) so Chatterbox mode does not depend on system/Homebrew Python.
3. Add SHA-256 + expected-size verification for remote model packs and show integrity status in onboarding before install completes.

## Update protocol
- Update this file after each completed task and each nontrivial discovery.
- Keep `Next actions` to exactly 3 concrete tasks.
