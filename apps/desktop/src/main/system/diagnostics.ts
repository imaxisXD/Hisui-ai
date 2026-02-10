import { app } from "electron";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AppMetricSnapshot, DiagnosticsSnapshot } from "../../shared/types.js";
import { nowIso } from "../utils/time.js";

const MAX_CRASH_DUMP_FILES = 20;

async function listRecentCrashDumps(crashDumpsPath: string): Promise<string[]> {
  let fileNames: string[];
  try {
    fileNames = await readdir(crashDumpsPath);
  } catch {
    return [];
  }

  const filesWithTime = await Promise.all(fileNames.map(async (name) => {
    const fullPath = join(crashDumpsPath, name);
    try {
      const details = await stat(fullPath);
      if (!details.isFile()) {
        return null;
      }
      return { name, mtimeMs: details.mtimeMs };
    } catch {
      return null;
    }
  }));

  return filesWithTime
    .filter((entry): entry is { name: string; mtimeMs: number } => Boolean(entry))
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_CRASH_DUMP_FILES)
    .map((entry) => entry.name);
}

function collectAppMetrics(): AppMetricSnapshot[] {
  return app.getAppMetrics().map((metric) => ({
    pid: metric.pid,
    type: metric.type,
    cpuPercent: metric.cpu.percentCPUUsage,
    idleWakeupsPerSecond: metric.cpu.idleWakeupsPerSecond,
    workingSetSizeBytes: metric.memory.workingSetSize,
    peakWorkingSetSizeBytes: metric.memory.peakWorkingSetSize,
    privateMemoryBytes: metric.memory.privateBytes
  }));
}

export class DiagnosticsService {
  async getSnapshot(): Promise<DiagnosticsSnapshot> {
    const crashDumpsPath = app.getPath("crashDumps");

    return {
      collectedAt: nowIso(),
      appName: app.getName(),
      appVersion: app.getVersion(),
      crashDumpsPath,
      recentCrashDumps: await listRecentCrashDumps(crashDumpsPath),
      appMetrics: collectAppMetrics()
    };
  }
}
