import { statfs } from "node:fs/promises";
import { app } from "electron";

export async function getDiskHealth(): Promise<{ ok: boolean; freeBytes?: number; error?: string }> {
  try {
    const userData = app.getPath("userData");
    const stats = await statfs(userData);
    const freeBytes = stats.bavail * stats.bsize;
    return {
      ok: freeBytes > 1024 * 1024 * 512,
      freeBytes
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
