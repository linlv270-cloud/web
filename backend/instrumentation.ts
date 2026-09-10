export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startCopyWorker } = await import("./lib/copy-worker");
  startCopyWorker();
}
