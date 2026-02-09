# Audio Sidecar Service

Local HTTP sidecar used by the desktop app for:
- TTS synthesis (single and batch)
- voice listing
- expression tag validation
- optional local text normalization endpoint

## Engine behavior

1. Uses `mlx-audio` model loading/generation when available.
2. Prefers bundled local model paths under `LOCAL_PODCAST_MODELS_DIR/{kokoro|chatterbox}`.
3. Falls back to deterministic stub-wave synthesis if `mlx-audio` is unavailable or fails.

## Run

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py --port 43111
```

Use Python `3.12` or `3.13` for sidecar environments. Python `3.14` is currently incompatible with some native dependencies (`pydantic-core` build chain).

## Seed offline cache

Bundle-required Hugging Face cache entries for Chatterbox runtime:

```bash
python3 scripts/seed_offline_cache.py --models-dir ../../resources/models
```

## Environment

- `LOCAL_PODCAST_MODELS_DIR`: root path for bundled models.
- `HF_HOME`: Hugging Face cache path (desktop app defaults to `resources/models/.hf-cache`).
- `HF_HUB_OFFLINE`: set to `1` for strict offline model resolution.
- `TRANSFORMERS_OFFLINE`: set to `1` for strict offline tokenizer/model resolution.
- `LOCAL_PODCAST_KOKORO_MODEL`: optional explicit model source/path override.
- `LOCAL_PODCAST_CHATTERBOX_MODEL`: optional explicit model source/path override.
- `LOCAL_PODCAST_ENABLE_MLX`: set to `0` to force stub synthesis mode.
- `LOCAL_PODCAST_KOKORO_BACKEND`: `auto` (default), `node`, `node-first`, or `node-fallback`.
- `LOCAL_PODCAST_KOKORO_NODE_SCRIPT`: path to `services/kokoro-node/cli.mjs`.
- `LOCAL_PODCAST_NODE_HF_CACHE`: cache root for Node Kokoro model assets.
- `LOCAL_PODCAST_NODE_BIN`: Node runtime used for node backend (desktop defaults to Electron binary).
- `LOCAL_PODCAST_NODE_BIN_FLAGS`: optional runtime flags (desktop defaults to `--run-as-node`).

The desktop app starts this service automatically.
