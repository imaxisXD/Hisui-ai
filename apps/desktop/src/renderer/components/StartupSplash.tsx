import type { BootstrapStatus } from "../../shared/types";

interface StartupSplashProps {
  status: BootstrapStatus | null;
}

const eyebrowClass = "text-[0.65rem] font-geist-mono uppercase tracking-[0.12em] text-ui-text-muted";

export function StartupSplash({ status }: StartupSplashProps) {
  const percent = status?.percent ?? 0;
  return (
    <main className="grid min-h-screen place-items-center p-5">
      <section className="w-[min(520px,92vw)] rounded-[10px] border border-ui-border bg-ui-bg-card px-[1.3rem] py-[1.2rem] shadow-ui-sm animate-[staggerReveal_400ms_cubic-bezier(0.16,1,0.3,1)]">
        <p className={eyebrowClass}>Runtime Startup</p>
        <h1 className="my-[0.35rem] text-[clamp(1.3rem,2.6vw,1.8rem)]">Preparing your workspace</h1>
        <p className="m-0 text-ui-text-secondary">{status?.message ?? "Starting services..."}</p>
        <div className="mt-[0.9rem] h-2 w-full overflow-hidden rounded-md border border-ui-border bg-ui-bg-input" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <div className="h-full bg-ui-progress transition-[width] duration-250" style={{ width: `${percent}%` }} />
        </div>
        <p className="mb-0 mt-[0.4rem] font-geist-mono text-[0.72rem] text-ui-text-muted">{percent}%</p>
      </section>
    </main>
  );
}
