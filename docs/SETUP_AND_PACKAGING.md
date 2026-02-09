# Setup and Packaging Checklist

## 1) Install dependencies

```bash
npm install
```

## 2) Choose model delivery strategy

Two supported flows:

1. `Bundled fallback`: keep model directories in `resources/models/*` and the app installs from local bundled assets.
2. `Hybrid download-first`: configure pack URLs and let first-run onboarding download/install packs once, then run locally afterward.

### Bundled fallback assets (recommended for local dev)

Copy these files into local resources before running packaging:

- `resources/bin/ffmpeg` (executable)
- `resources/bin/llama-cli` (optional, executable)
- `resources/models/kokoro/...`
- `resources/models/chatterbox/...`
- `resources/models/llm/default.gguf` (optional for LLM prep)
- `resources/fonts/BodoniModa-VariableFont_opsz,wght.ttf`
- `resources/fonts/SourceSans3-VariableFont_wght.ttf`

Model directory expectations for offline MLX rendering:
- `resources/models/kokoro/` contains local Kokoro model assets.
- `resources/models/chatterbox/` contains local Chatterbox model assets.
- `resources/models/.hf-cache/` contains preseeded Hugging Face cache for `mlx-community/S3TokenizerV2`.
- Optional overrides:
  - `LOCAL_PODCAST_KOKORO_MODEL`
  - `LOCAL_PODCAST_CHATTERBOX_MODEL`

### Hybrid download-first configuration (production-style UX)

Set one or both env vars to enable internet model pack downloads in onboarding:

- `LOCAL_PODCAST_MODEL_URL_KOKORO_PACK` (required pack)
- `LOCAL_PODCAST_MODEL_URL_CHATTERBOX_PACK` (optional expressive pack)

Expected remote artifact format:
- `tar.gz` archive
- contains either `models/<target>/...` or `<target>/...` directories
- targets currently used by app:
  - `kokoro`, `kokoro-node-cache`
  - `chatterbox`, `.hf-cache`

If these vars are unset, onboarding falls back to bundled install sources automatically.

## 3) Development run

```bash
npm run dev
```

## 4) Quality gates

```bash
npm run typecheck
npm run test
```

## 4.1) Sidecar Python environment (for local smoke tests)

Use Python `3.12` or `3.13` (avoid `3.14` due current native dependency incompatibilities):

```bash
python3.12 -m venv services/audio/.venv
source services/audio/.venv/bin/activate
pip install -r services/audio/requirements.txt
```

Seed required offline cache artifacts:

```bash
npm run seed:offline-cache
```

Optional: seed Node Kokoro model cache for sidecar node fallback:

```bash
npm run seed:kokoro-node
```

## 5) Package (macOS arm64)

```bash
npm run package
```

## 6) Notarization/signing

`electron-builder` is wired with `afterSign: scripts/notarize.cjs`.

Set these env vars for release builds:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

For code-sign identity/certificate, configure standard Electron Builder signing env (`CSC_NAME` or `CSC_LINK` + `CSC_KEY_PASSWORD`).

When notarization env vars are missing, packaging still succeeds and notarization is skipped with a log message.

## Notes

- Sidecar uses `mlx-audio` first and falls back to deterministic stub synthesis only on runtime/model errors.
- Sidecar Kokoro backend can also use Node (`kokoro-js`) when `LOCAL_PODCAST_KOKORO_BACKEND=node|node-first|node-fallback`.
- Desktop sidecar launch defaults to strict offline Hugging Face mode (`HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`).
- Render export falls back to system `ffmpeg` if bundled binary is missing.
