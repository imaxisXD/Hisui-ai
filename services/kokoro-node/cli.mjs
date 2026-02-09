#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
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
  const fromEnv = process.env.LOCAL_PODCAST_NODE_HF_CACHE ?? process.env.HF_HOME;
  return resolve(fromArgs ?? fromEnv ?? ".cache/kokoro-node-cache");
}

function parseSpeed(value, fallback = 1) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

async function parseBatchJobs(args, defaultVoice, defaultSpeed) {
  const manifestPath = args.batchManifest?.trim();
  if (!manifestPath) {
    return null;
  }

  const payloadRaw = await readFile(resolve(manifestPath), "utf-8");
  const payload = JSON.parse(payloadRaw);
  const entries = Array.isArray(payload) ? payload : Array.isArray(payload?.tasks) ? payload.tasks : [];
  if (entries.length === 0) {
    throw new Error(`Batch manifest has no tasks: ${manifestPath}`);
  }

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Batch task ${index + 1} is invalid.`);
    }

    const text = typeof entry.text === "string" ? entry.text : "";
    const output = typeof entry.output === "string" ? entry.output : "";
    if (!text.trim()) {
      throw new Error(`Batch task ${index + 1} missing text.`);
    }
    if (!output.trim()) {
      throw new Error(`Batch task ${index + 1} missing output path.`);
    }

    const voice = typeof entry.voice === "string" && entry.voice.trim() ? entry.voice.trim() : defaultVoice;
    const speed = parseSpeed(entry.speed, defaultSpeed);
    return {
      text,
      outputPath: resolve(output),
      voice,
      speed
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelId = pickModelId(args);
  const defaultVoice = pickVoice(args);
  const defaultSpeed = pickSpeed(args);
  const dtype = args.dtype ?? process.env.LOCAL_PODCAST_KOKORO_NODE_DTYPE ?? "q8";
  const device = args.device ?? process.env.LOCAL_PODCAST_KOKORO_NODE_DEVICE ?? "cpu";
  const cacheDir = pickCacheDir(args);

  transformersEnv.cacheDir = cacheDir;
  process.env.HF_HOME = process.env.HF_HOME ?? cacheDir;
  process.env.HF_HUB_CACHE = process.env.HF_HUB_CACHE ?? resolve(cacheDir, "hub");

  const batchJobs = await parseBatchJobs(args, defaultVoice, defaultSpeed);
  const singleText = args.text ?? "";
  const singleOutput = args.output;
  if (!batchJobs) {
    if (!singleOutput) {
      throw new Error("Missing required argument: --output");
    }
    if (!singleText.trim()) {
      throw new Error("Missing required argument: --text");
    }
  }

  const jobs = batchJobs ?? [{
    text: singleText,
    outputPath: resolve(singleOutput),
    voice: defaultVoice,
    speed: defaultSpeed
  }];

  await mkdir(cacheDir, { recursive: true });
  for (const job of jobs) {
    await mkdir(dirname(job.outputPath), { recursive: true });
  }

  const tts = await KokoroTTS.from_pretrained(modelId, {
    dtype,
    device
  });
  process.stdout.write(`[kokoro-node] model-ready jobs=${jobs.length} dtype=${dtype} device=${device}\n`);

  for (let index = 0; index < jobs.length; index += 1) {
    const job = jobs[index];
    if (!job) {
      continue;
    }
    const audio = await tts.generate(job.text, {
      voice: job.voice,
      speed: job.speed
    });
    await Promise.resolve(audio.save(job.outputPath));
    process.stdout.write(`[kokoro-node] job ${index + 1}/${jobs.length} saved=${job.outputPath}\n`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
