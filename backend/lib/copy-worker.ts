import {
  generateInternalCopy,
  generateUpgradeCopy,
  generateUpgradeFallback,
  selectGenerationTags,
} from "./copywriter";
import { getRedbookSettings } from "./redbook-settings";
import {
  addCopyGenerationInbox,
  claimNextCopyGeneration,
  completeCopyGeneration,
  copyGenerationDeadlineCandidates,
  failCopyGeneration,
  getCopyGeneration,
  getCreator,
  getTrendSettings,
  isCopyGenerationProcessing,
  recoverInterruptedCopyGenerations,
  refreshTrendTerms,
  selectTrendTerms,
  setCopyGenerationStage,
} from "./repository";

const workerState = globalThis as typeof globalThis & {
  __qidengCopyWorker?: {
    started: boolean;
    active: number;
    timer?: NodeJS.Timeout;
    recoveryTimer?: NodeJS.Timeout;
    deadlineTimer?: NodeJS.Timeout;
    trendTimer?: NodeJS.Timeout;
  };
};

async function processTask(task: NonNullable<ReturnType<typeof claimNextCopyGeneration>>) {
  const creator = getCreator(task.creator_id);
  if (!creator) throw new Error("用户不存在");
  const settings = getRedbookSettings();
  if (!settings.enabled) throw new Error("文案生成功能暂未开放");

  try {
    setCopyGenerationStage(task.id, "analyzing");
    const variant = task.id + (task.mode === "free" ? creator.copyQuota.freeUsed : creator.copyQuota.upgradeUsed);
    const selectedTags = selectGenerationTags(creator, variant);
    const trendTerms = selectTrendTerms(creator, task.mode, variant);
    let result;
    if (task.mode === "free") {
      result = generateInternalCopy(creator, settings, variant, trendTerms, selectedTags);
    } else {
      const fallback = generateUpgradeFallback(creator, settings, variant, trendTerms, selectedTags);
      const modelAttempt = generateUpgradeCopy(
        creator,
        settings,
        selectedTags,
        trendTerms,
        (stage) => {
          if (isCopyGenerationProcessing(task.id)) setCopyGenerationStage(task.id, stage);
        },
      ).then((value) => ({ value, failed: false as const })).catch(() => ({ value: fallback, failed: true as const }));
      const timeout = new Promise<{ value: typeof fallback; failed: true }>((resolve) =>
        setTimeout(() => resolve({ value: fallback, failed: true }), 3700),
      );
      result = (await Promise.race([modelAttempt, timeout])).value;
    }
    if (!isCopyGenerationProcessing(task.id)) return;
    setCopyGenerationStage(task.id, "checking");
    const completed = completeCopyGeneration(task.id, result.title, result.body, {
      visualFacts: "visualFacts" in result && Array.isArray(result.visualFacts)
        ? result.visualFacts as string[]
        : [],
      usedTags: "usedTags" in result && Array.isArray(result.usedTags)
        ? result.usedTags as string[]
        : selectedTags,
    });
    if (completed) addCopyGenerationInbox(task.creator_id, completed, true);
  } catch (error) {
    failCopyGeneration(task.id, error);
    const failed = getCopyGeneration(task.id);
    if (failed) addCopyGenerationInbox(task.creator_id, failed, false);
  }
}

function finishExpiredUpgradeTasks() {
  for (const task of copyGenerationDeadlineCandidates(4)) {
    const creator = getCreator(task.creator_id);
    if (!creator) {
      failCopyGeneration(task.id, "用户不存在");
      continue;
    }
    try {
      const settings = getRedbookSettings();
      const selectedTags = selectGenerationTags(creator, task.id);
      const trends = selectTrendTerms(creator, "upgrade", task.id);
      const fallback = generateUpgradeFallback(creator, settings, task.id, trends, selectedTags);
      const completed = completeCopyGeneration(task.id, fallback.title, fallback.body, {
        visualFacts: fallback.visualFacts,
        usedTags: fallback.usedTags,
      });
      if (completed) addCopyGenerationInbox(task.creator_id, completed, true);
    } catch (error) {
      if (isCopyGenerationProcessing(task.id)) failCopyGeneration(task.id, error);
    }
  }
}

function refreshTrendsWhenDue() {
  const settings = getTrendSettings();
  if (!settings.automaticUpdate) return;
  const last = settings.lastAutoUpdateAt ? Date.parse(`${settings.lastAutoUpdateAt.replace(" ", "T")}Z`) : 0;
  if (Date.now() - last < settings.updateIntervalHours * 3600000) return;
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", weekday: "short" }).format(new Date()),
  );
  const full = weekday === settings.weeklyFullUpdateDay;
  refreshTrendTerms(full);
}

async function pump() {
  const state = workerState.__qidengCopyWorker;
  if (!state?.started) return;
  const configured = Number(process.env.COPY_WORKER_CONCURRENCY || 8);
  const concurrency = Number.isFinite(configured) ? Math.min(16, Math.max(1, configured)) : 8;
  while (state.active < concurrency) {
    const task = claimNextCopyGeneration();
    if (!task) break;
    state.active += 1;
    void processTask(task).finally(() => {
      const current = workerState.__qidengCopyWorker;
      if (current) current.active = Math.max(0, current.active - 1);
      void pump();
    });
  }
}

export function startCopyWorker() {
  if (workerState.__qidengCopyWorker?.started) return;
  workerState.__qidengCopyWorker = { started: true, active: 0 };
  recoverInterruptedCopyGenerations();
  workerState.__qidengCopyWorker.timer = setInterval(() => void pump(), 250);
  workerState.__qidengCopyWorker.deadlineTimer = setInterval(finishExpiredUpgradeTasks, 250);
  workerState.__qidengCopyWorker.trendTimer = setInterval(refreshTrendsWhenDue, 30 * 60000);
  workerState.__qidengCopyWorker.recoveryTimer = setInterval(() => {
    recoverInterruptedCopyGenerations(true);
    void pump();
  }, 30000);
  refreshTrendsWhenDue();
  void pump();
}
