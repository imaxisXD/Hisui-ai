import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import type { LlmPrepResult } from "../../shared/types.js";
import { getLlamaCliPath, getModelsDir } from "../utils/paths.js";

export class LlmPrepService {
  private readonly modelPath: string;

  constructor(modelPath = `${getModelsDir()}/llm/default.gguf`) {
    this.modelPath = modelPath;
  }

  async available(): Promise<boolean> {
    try {
      await access(getLlamaCliPath(), constants.X_OK);
      await access(this.modelPath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async prepareText(text: string): Promise<LlmPrepResult> {
    const ready = await this.available();
    if (!ready) {
      return {
        originalText: text,
        preparedText: text,
        changed: false
      };
    }

    const prompt = [
      "Rewrite ONLY punctuation and rhythm for speech readability.",
      "Do not add or remove facts.",
      "Keep explicit tags like [laughs] unchanged.",
      "Text:",
      text
    ].join("\n\n");

    const output = await runLlamaCli(prompt, this.modelPath);
    const preparedText = output.trim() || text;

    return {
      originalText: text,
      preparedText,
      changed: preparedText !== text
    };
  }
}

function runLlamaCli(prompt: string, modelPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(getLlamaCliPath(), [
      "-m", modelPath,
      "--temp", "0.2",
      "-p", prompt
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf-8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf-8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`llama-cli failed (${code}): ${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}
