import { nowIso } from "../utils/time.js";
import { getDb } from "../db/client.js";
import { logWarn } from "../utils/logging.js";

interface AppSettingRow {
  value_json: string;
}

export class AppSettingsStore {
  get<T>(key: string): T | null {
    const row = getDb().prepare("SELECT value_json FROM app_settings WHERE key = ?").get(key) as AppSettingRow | undefined;
    if (!row) {
      return null;
    }
    try {
      return JSON.parse(row.value_json) as T;
    } catch (error) {
      logWarn("app-settings", "failed to parse persisted setting json", {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    getDb().prepare(`
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (@key, @valueJson, @updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `).run({
      key,
      valueJson: JSON.stringify(value),
      updatedAt: nowIso()
    });
  }

  has(key: string): boolean {
    const row = getDb().prepare("SELECT key FROM app_settings WHERE key = ?").get(key) as { key: string } | undefined;
    return Boolean(row);
  }
}
