import { describe, expect, it } from "vitest";
import { runMigrations } from "./migrations.js";

describe("runMigrations", () => {
  it("creates app settings, project stats, and optimized indexes", () => {
    let executed = "";
    runMigrations({
      exec(sql: string) {
        executed = sql;
      }
    } as never);

    expect(executed).toContain("CREATE TABLE IF NOT EXISTS app_settings");
    expect(executed).toContain("CREATE TABLE IF NOT EXISTS project_stats");
    expect(executed).toContain("CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at");
    expect(executed).toContain("CREATE INDEX IF NOT EXISTS idx_projects_updated_created");
    expect(executed).toContain("CREATE INDEX IF NOT EXISTS idx_jobs_project_activity");
  });
});
