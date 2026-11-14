export async function register() {
  // `next build` also loads this file; only a running server should scan.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  const { refreshCacheOnStartup } = await import("./lib/startup-scan");
  // Not awaited: register() must finish before the server accepts requests, and a scan can take a while.
  void refreshCacheOnStartup();
}
