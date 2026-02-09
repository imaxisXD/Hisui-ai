from __future__ import annotations

import argparse
import logging
import math
import os
import re
import shlex
import subprocess
import sys
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field
import uvicorn

LOGGER = logging.getLogger("local-podcast.audio")

try:
    import numpy as np
except ImportError:  # pragma: no cover - environment dependent
    np = None  # type: ignore[assignment]

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - environment dependent
    sf = None  # type: ignore[assignment]

SUPPORTED_TAGS = ["laughs", "sighs", "chuckles", "breathes", "whispers"]

MODEL_SOURCES = {
    "kokoro": {
        "default": "mlx-community/Kokoro-82M-bf16",
        "env": "LOCAL_PODCAST_KOKORO_MODEL",
    },
    "chatterbox": {
        "default": "mlx-community/Chatterbox-bf16",
        "env": "LOCAL_PODCAST_CHATTERBOX_MODEL",
    },
}

VOICE_MAP = {
    "kokoro_narrator": "af_heart",
    "kokoro_story": "af_bella",
    "chatterbox_expressive": "expressive",
    "chatterbox_studio": "neutral",
}

VOICE_LIBRARY = [
    {
        "id": "kokoro_narrator",
        "model": "kokoro",
        "label": "Kokoro Narrator",
        "description": "Neutral long-form narration (engine: af_heart)",
    },
    {
        "id": "kokoro_story",
        "model": "kokoro",
        "label": "Kokoro Story",
        "description": "Warm storytelling voice (engine: af_bella)",
    },
    {
        "id": "chatterbox_expressive",
        "model": "chatterbox",
        "label": "Chatterbox Expressive",
        "description": "Expression-heavy dialogue",
    },
    {
        "id": "chatterbox_studio",
        "model": "chatterbox",
        "label": "Chatterbox Studio",
        "description": "Balanced expressive studio voice",
    },
]


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    model: Literal["kokoro", "chatterbox"]
    speed: float = 1.0
    expression_tags: List[str] = Field(default_factory=list)
    output_dir: str


class SegmentRequest(BaseModel):
    id: str
    text: str
    voiceId: str
    model: Literal["kokoro", "chatterbox"]
    speed: float = 1.0
    expressionTags: List[str] = Field(default_factory=list)


class BatchTTSRequest(BaseModel):
    segments: List[SegmentRequest]
    output_dir: str


class ValidateTagsRequest(BaseModel):
    text: str


class LlmPrepRequest(BaseModel):
    text: str


@dataclass
class SynthResult:
    wav_path: str
    used_engine: str


class RuntimeState:
    def __init__(self) -> None:
        self.model_cache: Dict[str, Any] = {}
        self.model_source: Dict[str, str] = {}
        self.mlx_probe_attempted: bool = False
        self.mlx_probe_available: bool = False
        self.mlx_probe_error: str | None = None
        self.mlx_load_model: Any | None = None


STATE = RuntimeState()
app = FastAPI()


def ensure_espeak_wrapper_compat() -> None:
    """Bridge phonemizer API differences required by misaki/kokoro loaders."""
    try:
        from phonemizer.backend.espeak.wrapper import EspeakWrapper
    except Exception:
        return

    if hasattr(EspeakWrapper, "set_data_path"):
        return

    def _set_data_path(cls: Any, path: str) -> None:
        setattr(cls, "data_path", path)

    setattr(EspeakWrapper, "set_data_path", classmethod(_set_data_path))


@app.get("/health")
def health() -> dict:
    models_dir_value = os.getenv("LOCAL_PODCAST_MODELS_DIR", "").strip()
    models_dir = Path(models_dir_value) if models_dir_value else None
    has_model_dir = bool(models_dir and models_dir.exists())
    mlx_ready = mlx_runtime_available()
    mlx_enabled = mlx_runtime_enabled()

    if not mlx_enabled:
        status = "mlx_disabled"
    elif mlx_ready and has_model_dir:
        status = "mlx_ready"
    elif mlx_ready:
        status = "mlx_ready_no_local_model_dir"
    else:
        status = "stub_only"

    return {
        "running": True,
        "model_status": status,
        "loaded_models": sorted(STATE.model_cache.keys()),
        "mlx_probe_error": STATE.mlx_probe_error,
    }


@app.post("/voices")
def voices() -> dict:
    return {"voices": VOICE_LIBRARY}


@app.post("/validate-tags")
def validate_tags(payload: ValidateTagsRequest) -> dict:
    tags = extract_tags(payload.text)
    invalid_tags = [tag for tag in tags if tag not in SUPPORTED_TAGS]
    return {
        "isValid": len(invalid_tags) == 0,
        "invalidTags": invalid_tags,
        "supportedTags": SUPPORTED_TAGS,
    }


@app.post("/llm-prep")
def llm_prep(payload: LlmPrepRequest) -> dict:
    original = payload.text
    prepared = normalize_for_speech(original)
    return {
        "originalText": original,
        "preparedText": prepared,
        "changed": prepared != original,
    }


@app.post("/tts")
def tts(payload: TTSRequest) -> dict:
    output_dir = Path(payload.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"seg-{sanitize(payload.voice_id)}-{hash(payload.text) & 0xFFFFFFFF:x}.wav"
    output_path = output_dir / filename

    result = synthesize(
        text=payload.text,
        output_path=output_path,
        speed=payload.speed,
        model=payload.model,
        voice_id=payload.voice_id,
        expression_tags=payload.expression_tags,
    )
    return {"wavPath": str(output_path), "engine": result.used_engine}


@app.post("/batch-tts")
def batch_tts(payload: BatchTTSRequest) -> dict:
    output_dir = Path(payload.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    wav_paths: List[str] = []
    engines: List[str] = []
    for index, segment in enumerate(payload.segments):
        filename = f"seg-{index:05d}-{sanitize(segment.id)}.wav"
        output_path = output_dir / filename

        result = synthesize(
            text=segment.text,
            output_path=output_path,
            speed=segment.speed,
            model=segment.model,
            voice_id=segment.voiceId,
            expression_tags=segment.expressionTags,
        )
        wav_paths.append(str(output_path))
        engines.append(result.used_engine)

    return {"wavPaths": wav_paths, "engines": engines}


def synthesize(
    text: str,
    output_path: Path,
    speed: float,
    model: str,
    voice_id: str,
    expression_tags: List[str],
) -> SynthResult:
    cleaned_text = normalize_for_speech(text)
    render_text = apply_expression_tags(cleaned_text, expression_tags)

    if should_try_node_before_python(model):
        try:
            return synthesize_kokoro_node(
                text=render_text,
                output_path=output_path,
                speed=speed,
                voice_id=voice_id,
            )
        except Exception as error:
            LOGGER.exception(
                "Kokoro node backend failed before mlx attempt, continuing with mlx: %s",
                error,
            )

    if not mlx_runtime_available():
        if should_try_node_after_python(model):
            try:
                return synthesize_kokoro_node(
                    text=render_text,
                    output_path=output_path,
                    speed=speed,
                    voice_id=voice_id,
                )
            except Exception as error:
                LOGGER.exception(
                    "Kokoro node backend failed while mlx unavailable, falling back to stub: %s",
                    error,
                )
        synthesize_stub(cleaned_text, output_path, speed=speed, model=model)
        return SynthResult(wav_path=str(output_path), used_engine="stub")

    try:
        synthesize_mlx(
            text=render_text,
            output_path=output_path,
            speed=speed,
            model=model,
            voice_id=voice_id,
            expression_tags=[],
        )
        return SynthResult(wav_path=str(output_path), used_engine="mlx-audio")
    except Exception as error:  # pragma: no cover - environment dependent
        LOGGER.exception("mlx-audio synthesis failed, falling back to stub: %s", error)
        if should_try_node_after_python(model):
            try:
                return synthesize_kokoro_node(
                    text=render_text,
                    output_path=output_path,
                    speed=speed,
                    voice_id=voice_id,
                )
            except Exception as node_error:
                LOGGER.exception(
                    "Kokoro node backend failed after mlx failure, falling back to stub: %s",
                    node_error,
                )
        synthesize_stub(cleaned_text, output_path, speed=speed, model=model)
        return SynthResult(wav_path=str(output_path), used_engine="stub")


def synthesize_mlx(
    text: str,
    output_path: Path,
    speed: float,
    model: str,
    voice_id: str,
    expression_tags: List[str],
) -> None:
    model_instance = get_or_load_model(model)
    model_voice = resolve_voice_id(voice_id, model)
    render_text = apply_expression_tags(text, expression_tags)

    waveform = render_with_model(model_instance, model, render_text, model_voice, speed)
    sample_rate = infer_sample_rate(model_instance)
    write_waveform(output_path, waveform, sample_rate)


def render_with_model(model_instance: Any, model_kind: str, text: str, voice: str, speed: float):
    if np is None:
        raise RuntimeError("numpy is required to process mlx-audio output")

    chunks = []

    attempt_kwargs = [
        {"voice": voice, "speed": speed, "lang_code": resolve_lang_code(voice)},
        {"voice": voice, "speed": speed},
        {"voice": voice},
        {},
    ]

    last_error: Exception | None = None
    for kwargs in attempt_kwargs:
        try:
            results = model_instance.generate(text=text, **kwargs)
            chunks = collect_chunks(results)
            if chunks:
                break
        except TypeError:
            try:
                results = model_instance.generate(text, **kwargs)
                chunks = collect_chunks(results)
                if chunks:
                    break
            except Exception as error:  # pragma: no cover - runtime specific
                last_error = error
        except Exception as error:  # pragma: no cover - runtime specific
            last_error = error

    if not chunks:
        if last_error:
            raise RuntimeError(f"mlx-audio generation failed: {last_error}")
        raise RuntimeError("mlx-audio returned no audio chunks")

    return np.concatenate(chunks)


def collect_chunks(results: Any):
    if np is None:
        return []

    collected = []
    for result in results:
        audio = getattr(result, "audio", None)
        if audio is None:
            continue
        array = to_numpy(audio)
        if array is None or array.size == 0:
            continue
        # Ensure mono 1D waveform.
        if array.ndim > 1:
            array = array.reshape(-1)
        collected.append(array.astype(np.float32))
    return collected


def to_numpy(audio: Any):
    if np is None:
        return None

    if isinstance(audio, np.ndarray):
        return audio

    try:
        return np.asarray(audio)
    except Exception:
        pass

    if hasattr(audio, "tolist"):
        try:
            return np.asarray(audio.tolist())
        except Exception:
            return None

    return None


def write_waveform(output_path: Path, waveform: Any, sample_rate: int) -> None:
    if np is None:
        raise RuntimeError("numpy is required for waveform writing")

    clipped = np.clip(waveform, -1.0, 1.0)

    if sf is not None:
        sf.write(str(output_path), clipped, sample_rate)
        return

    scaled = (clipped * 32767.0).astype(np.int16)
    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(scaled.tobytes())


def get_or_load_model(model_kind: str) -> Any:
    ensure_espeak_wrapper_compat()

    load_model = get_mlx_loader()
    if load_model is None:
        raise RuntimeError("mlx-audio loader is unavailable in current runtime")

    cached = STATE.model_cache.get(model_kind)
    if cached is not None:
        return cached

    source = resolve_model_source(model_kind)
    LOGGER.info("Loading mlx-audio model '%s' from '%s'", model_kind, source)
    model_instance = load_model(source)
    STATE.model_cache[model_kind] = model_instance
    STATE.model_source[model_kind] = source
    return model_instance


def mlx_runtime_enabled() -> bool:
    return os.getenv("LOCAL_PODCAST_ENABLE_MLX", "1").lower() not in {"0", "false", "no"}


def mlx_runtime_available() -> bool:
    if not mlx_runtime_enabled():
        return False

    if not STATE.mlx_probe_attempted:
        probe_mlx_runtime()
    return STATE.mlx_probe_available


def probe_mlx_runtime() -> None:
    if STATE.mlx_probe_attempted:
        return

    STATE.mlx_probe_attempted = True

    try:
        result = subprocess.run(
            [sys.executable, "-c", "from mlx_audio.tts.utils import load_model"],
            capture_output=True,
            text=True,
            check=False,
            timeout=20,
        )
        STATE.mlx_probe_available = result.returncode == 0
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            STATE.mlx_probe_error = stderr or stdout or f"probe_exit_{result.returncode}"
    except Exception as error:  # pragma: no cover - environment dependent
        STATE.mlx_probe_available = False
        STATE.mlx_probe_error = str(error)


def get_mlx_loader():
    if not mlx_runtime_available():
        return None

    if STATE.mlx_load_model is not None:
        return STATE.mlx_load_model

    try:
        from mlx_audio.tts.utils import load_model as dynamic_loader
    except Exception as error:  # pragma: no cover - environment dependent
        STATE.mlx_probe_available = False
        STATE.mlx_probe_error = str(error)
        return None

    STATE.mlx_load_model = dynamic_loader
    return dynamic_loader


def resolve_model_source(model_kind: str) -> str:
    config = MODEL_SOURCES[model_kind]
    env_value = os.getenv(config["env"])
    if env_value:
        return env_value

    models_dir_value = os.getenv("LOCAL_PODCAST_MODELS_DIR", "").strip()
    if not models_dir_value:
        raise RuntimeError(
            f"LOCAL_PODCAST_MODELS_DIR is not set; cannot resolve bundled '{model_kind}' model."
        )

    models_dir = Path(models_dir_value)
    local_dir = models_dir / model_kind
    if local_dir.exists():
        return str(local_dir)

    raise RuntimeError(
        f"Bundled model directory missing for '{model_kind}': expected '{local_dir}'. "
        f"Provide local assets or set {config['env']} explicitly."
    )


def resolve_voice_id(voice_id: str, model_kind: str) -> str:
    mapped = VOICE_MAP.get(voice_id, voice_id).strip()

    if model_kind != "kokoro":
        return mapped or "neutral"

    if mapped.endswith(".safetensors"):
        voice_path = Path(mapped)
        if voice_path.exists():
            return str(voice_path)
        mapped = voice_path.stem

    models_dir_value = os.getenv("LOCAL_PODCAST_MODELS_DIR", "").strip()
    if models_dir_value:
        voices_dir = Path(models_dir_value) / "kokoro" / "voices"
        if mapped:
            candidate = voices_dir / f"{mapped}.safetensors"
            if candidate.exists():
                return str(candidate)

    return mapped or "af_heart"


def kokoro_backend_mode() -> str:
    return os.getenv("LOCAL_PODCAST_KOKORO_BACKEND", "auto").strip().lower()


def should_try_node_before_python(model_kind: str) -> bool:
    if model_kind != "kokoro":
        return False
    return kokoro_backend_mode() in {"node", "node-first"}


def should_try_node_after_python(model_kind: str) -> bool:
    if model_kind != "kokoro":
        return False
    return kokoro_backend_mode() in {"auto", "node", "node-first", "node-fallback", "python-node"}


def resolve_kokoro_node_voice(voice_id: str) -> str:
    mapped = VOICE_MAP.get(voice_id, voice_id).strip()
    if mapped.endswith(".safetensors"):
        mapped = Path(mapped).stem
    return mapped or "af_heart"


def resolve_kokoro_node_script_path() -> Path:
    override = os.getenv("LOCAL_PODCAST_KOKORO_NODE_SCRIPT", "").strip()
    if override:
        candidate = Path(override).expanduser().resolve()
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"Configured kokoro node script not found: {candidate}")

    candidate = Path(__file__).resolve().parents[1] / "kokoro-node" / "cli.mjs"
    if candidate.exists():
        return candidate

    raise FileNotFoundError(
        "Kokoro node script not found. Expected LOCAL_PODCAST_KOKORO_NODE_SCRIPT "
        "or sibling path services/kokoro-node/cli.mjs."
    )


def synthesize_kokoro_node(text: str, output_path: Path, speed: float, voice_id: str) -> SynthResult:
    script = resolve_kokoro_node_script_path()
    node_binary = os.getenv("LOCAL_PODCAST_NODE_BIN", "node").strip() or "node"
    node_flags_raw = os.getenv("LOCAL_PODCAST_NODE_BIN_FLAGS", "").strip()
    if not node_flags_raw and "electron" in Path(node_binary).name.lower():
        node_flags_raw = "--run-as-node"
    node_flags = shlex.split(node_flags_raw)
    if "electron" in Path(node_binary).name.lower() and "--run-as-node" not in node_flags:
        node_flags.insert(0, "--run-as-node")
    node_voice = resolve_kokoro_node_voice(voice_id)

    env = dict(os.environ)
    models_dir_value = os.getenv("LOCAL_PODCAST_MODELS_DIR", "").strip()
    default_cache = ""
    if models_dir_value:
        default_cache = str(Path(models_dir_value) / "kokoro-node-cache")

    node_cache = os.getenv("LOCAL_PODCAST_NODE_HF_CACHE", default_cache).strip()
    if node_cache:
        node_cache_path = Path(node_cache)
        node_cache_path.mkdir(parents=True, exist_ok=True)
        hf_hub_cache = node_cache_path / "hub"
        hf_hub_cache.mkdir(parents=True, exist_ok=True)
        env["HF_HOME"] = str(node_cache_path)
        env["HF_HUB_CACHE"] = str(hf_hub_cache)

    command = [
        node_binary,
        *node_flags,
        str(script),
        "--text",
        text,
        "--voice",
        node_voice,
        "--output",
        str(output_path),
        "--speed",
        str(speed),
    ]

    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
        env=env,
    )

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        detail = stderr or stdout or f"exit_{result.returncode}"
        raise RuntimeError(f"kokoro-node synthesis failed: {detail}")

    if not output_path.exists():
        raise RuntimeError("kokoro-node synthesis completed without writing output file")

    return SynthResult(wav_path=str(output_path), used_engine="kokoro-node")


def resolve_lang_code(voice: str) -> str:
    prefix = voice[:1].lower()
    if prefix in {"a", "b", "j", "z", "e", "f"}:
        return prefix
    return "a"


def infer_sample_rate(model_instance: Any) -> int:
    for attr in ("sample_rate", "sampling_rate", "sr"):
        value = getattr(model_instance, attr, None)
        if isinstance(value, int) and value > 0:
            return value
    return 24000


def apply_expression_tags(text: str, expression_tags: List[str]) -> str:
    if not expression_tags:
        return text

    normalized_tags = [tag.strip().lower() for tag in expression_tags if tag.strip()]
    if not normalized_tags:
        return text

    # Preserve manual control while giving expressive models a slight cue.
    tag_prefix = " ".join(f"[{tag}]" for tag in normalized_tags)
    if text.startswith("["):
        return text
    return f"{tag_prefix} {text}"


def extract_tags(text: str) -> List[str]:
    return [match.group(1).strip().lower() for match in re.finditer(r"\[([^\]]+)\]", text)]


def normalize_for_speech(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+,", ",", text)
    text = re.sub(r"\s+\.", ".", text)
    return text


def sanitize(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "", value) or "segment"


def synthesize_stub(text: str, output_path: Path, speed: float, model: str) -> SynthResult:
    duration_seconds = max(0.35, min(12.0, len(text.split()) / max(2.8 * speed, 0.5)))
    sample_rate = 24000
    frequency = 195.0 if model == "kokoro" else 230.0

    total_samples = int(duration_seconds * sample_rate)
    with wave.open(str(output_path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for i in range(total_samples):
            value = int(9000 * math.sin(2 * math.pi * frequency * (i / sample_rate)))
            wav_file.writeframesraw(value.to_bytes(2, byteorder="little", signed=True))

    return SynthResult(wav_path=str(output_path), used_engine="stub")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=43111)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
