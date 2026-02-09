# Local Podcast Maker

Local-first desktop tool for converting books into multi-voice podcasts with optional expression tags.

## v1 targets
- Electron desktop shell for macOS Apple Silicon.
- Offline speech generation via bundled sidecar and models.
- Input support: EPUB, TXT, PDF.
- Output: MP3 with per-project render history.

## Workspace
- `apps/desktop`: Electron + React + TypeScript desktop app.
- `services/audio`: Python sidecar API wrapping `mlx-audio`.
- `resources`: bundled binaries, models, and fonts for offline packaging.
- `test-fixtures`: sample files used in integration tests.
