import type { BootstrapStatus } from "../../shared/types";

interface StartupSplashProps {
  status: BootstrapStatus | null;
}

export function StartupSplash({ status }: StartupSplashProps) {
  const percent = status?.percent ?? 0;
  return (
    <main className="startup-splash">
      <section className="startup-splash-card">
        <p className="eyebrow">Runtime Startup</p>
        <h1>Preparing your workspace</h1>
        <p className="startup-splash-message">{status?.message ?? "Starting services..."}</p>
        <div className="startup-splash-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="startup-splash-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <p className="startup-splash-percent">{percent}%</p>
      </section>
    </main>
  );
}
