#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { KokoroTTS } = require("kokoro-js");
const { env: transformersEnv } = require("@huggingface/transformers");

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item || !item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = value;
    i += 1;
  }
  return parsed;
}

function pickModelId(args) {
  return args.model ?? process.env.LOCAL_PODCAST_KOKORO_NODE_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
}

function pickVoice(args) {
  return args.voice ?? "af_heart";
}

function pickSpeed(args) {
  const numeric = Number(args.speed ?? "1");
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

function pickCacheDir(args) {
  const fromArgs = args.cacheDir;
  const fromEnv = process.env.LOCAL_PODCAST_NODE_HF_CACHE;
  return resolve(fromArgs ?? fromEnv ?? ".cache/kokoro-node-cache");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = args.text ?? "";
  const output = args.output;

  if (!output) {
    throw new Error("Missing required argument: --output");
  }

  if (!text.trim()) {
    throw new Error("Missing required argument: --text");
  }

  const modelId = pickModelId(args);
  const voice = pickVoice(args);
  const speed = pickSpeed(args);
  const dtype = args.dtype ?? process.env.LOCAL_PODCAST_KOKORO_NODE_DTYPE ?? "q8";
  const device = args.device ?? process.env.LOCAL_PODCAST_KOKORO_NODE_DEVICE ?? "cpu";
  const cacheDir = pickCacheDir(args);

  transformersEnv.cacheDir = cacheDir;

  const outputPath = resolve(output);
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  const tts = await KokoroTTS.from_pretrained(modelId, {
    dtype,
    device
  });

  const audio = await tts.generate(text, {
    voice,
    speed
  });

  audio.save(outputPath);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
