#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from pathlib import Path

from huggingface_hub import hf_hub_download, snapshot_download


def resolve_default_models_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "resources" / "models"


def require_file(path: Path, label: str) -> None:
    if not path.exists():
        raise FileNotFoundError(f"Missing {label}: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed Hugging Face cache artifacts required for fully-offline sidecar runtime."
    )
    parser.add_argument(
        "--models-dir",
        default=str(resolve_default_models_dir()),
        help="Local models directory (default: repo resources/models)",
    )
    args = parser.parse_args()

    models_dir = Path(args.models_dir).expanduser().resolve()
    hf_home = models_dir / ".hf-cache"
    hf_hub_cache = hf_home / "hub"
    chatterbox_cache_dir = models_dir / "chatterbox"

    require_file(models_dir / "kokoro" / "config.json", "kokoro config")
    require_file(models_dir / "chatterbox" / "config.json", "chatterbox config")
    require_file(models_dir / "chatterbox" / "model.safetensors", "chatterbox model weights")
    require_file(models_dir / "chatterbox" / "conds.safetensors", "chatterbox conditionals")

    hf_hub_cache.mkdir(parents=True, exist_ok=True)
    chatterbox_cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(hf_home)
    os.environ["HF_HUB_CACHE"] = str(hf_hub_cache)

    print(f"[seed] HF_HOME={hf_home}")
    print(f"[seed] HF_HUB_CACHE={hf_hub_cache}")
    print("[seed] Downloading S3TokenizerV2 cache artifacts...")
    snapshot_download(
        repo_id="mlx-community/S3TokenizerV2",
        allow_patterns=["config.json", "model.safetensors"],
        cache_dir=str(hf_hub_cache),
        local_files_only=False,
    )

    print("[seed] Downloading chatterbox tokenizer mapping cache artifact...")
    hf_hub_download(
        repo_id="ResembleAI/chatterbox",
        filename="Cangjie5_TC.json",
        cache_dir=str(chatterbox_cache_dir),
        local_files_only=False,
    )

    print("[seed] Offline cache seeding complete.")


if __name__ == "__main__":
    main()
