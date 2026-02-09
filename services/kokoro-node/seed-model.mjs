#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { KokoroTTS } = require("kokoro-js");
const { env: transformersEnv } = require("@huggingface/transformers");

function parseArgs(argv) {
  const parsed = {};
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item || !item.startsWith("--")) {
      positional.push(item);
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
  if (!parsed.cacheDir && positional.length > 0) {
    parsed.cacheDir = positional[0];
  }
  return parsed;
}

function resolveDefaultCacheDir() {
  return resolve(process.cwd(), "resources", "models", "kokoro-node-cache");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelId = args.model ?? process.env.LOCAL_PODCAST_KOKORO_NODE_MODEL ?? "onnx-community/Kokoro-82M-v1.0-ONNX";
  const voice = args.voice ?? "af_heart";
  const dtype = args.dtype ?? process.env.LOCAL_PODCAST_KOKORO_NODE_DTYPE ?? "q8";
  const cacheDir = resolve(args.cacheDir ?? process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? resolveDefaultCacheDir());

  transformersEnv.cacheDir = cacheDir;

  process.env.HF_HOME = cacheDir;
  process.env.HF_HUB_CACHE = join(cacheDir, "hub");

  await mkdir(cacheDir, { recursive: true });
  await mkdir(join(cacheDir, "hub"), { recursive: true });

  console.log(`[seed] model=${modelId}`);
  console.log(`[seed] cache=${cacheDir}`);

  const tts = await KokoroTTS.from_pretrained(modelId, {
    dtype,
    device: "cpu"
  });

  // Warm one generation so tokenizer/voice assets are present in cache.
  await tts.generate("Cache warmup sample.", { voice, speed: 1 });
  console.log("[seed] Kokoro node cache warmup completed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
