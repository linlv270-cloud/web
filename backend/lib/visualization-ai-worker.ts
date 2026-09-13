import {
  processNextVisualizationAiRun,
  queueScheduledVisualizationAiRunIfDue,
} from "./visualization-planning";

const workerState = globalThis as typeof globalThis & {
  __tdeVisualizationAiWorkerStarted?: boolean;
};

export function startVisualizationAiWorker() {
  if (workerState.__tdeVisualizationAiWorkerStarted) return;
  workerState.__tdeVisualizationAiWorkerStarted = true;

  const tick = async () => {
    try {
      queueScheduledVisualizationAiRunIfDue();
      await processNextVisualizationAiRun();
    } catch (error) {
      console.error("visualization AI worker failed", error);
    }
  };

  const timer = setInterval(() => void tick(), 15_000);
  timer.unref();
  setTimeout(() => void tick(), 10_000).unref();
}
