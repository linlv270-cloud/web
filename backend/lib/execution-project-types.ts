export const PROJECT_SOURCES = [
  "CREATOR_CLUSTER",
  "CONCEPT_FIRST",
  "VENUE_REQUEST",
  "EXISTING_RELATIONSHIP",
] as const;
export type ProjectSource = (typeof PROJECT_SOURCES)[number];

export const PROJECT_STATUSES = ["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const HEALTH_STATUSES = ["GREEN", "YELLOW", "RED"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const TASK_STATUSES = [
  "DRAFT",
  "READY",
  "IN_PROGRESS",
  "WAITING_EXTERNAL",
  "WAITING_INTERNAL",
  "BLOCKED",
  "REVIEW",
  "REVISION_REQUIRED",
  "DONE",
  "CANCELLED",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PROJECT_ROLES = ["PROJECT_MANAGER", "MEMBER", "OBSERVER"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export type TaskEvidenceInput = {
  fileVersionId?: number | null;
  externalUrl?: string | null;
  note?: string | null;
};

export type TaskStateContext = {
  ownerId?: number | null;
  approverId?: number | null;
  dueAt?: string | null;
  deliverables?: string | null;
  acceptanceCriteria?: string | null;
  waitingFor?: string | null;
  waitingReason?: string | null;
  nextFollowUpAt?: string | null;
  blockerReason?: string | null;
  blockerImpact?: string | null;
  resultSummary?: string | null;
  noFileEvidenceReason?: string | null;
  evidence?: TaskEvidenceInput[];
  revisionReason?: string | null;
  cancelReason?: string | null;
  reopenedBy?: number | null;
  reopenReason?: string | null;
};

export type TaskHealthInput = {
  status: TaskStatus;
  dueAt?: string | null;
  isKey?: boolean;
  updatedAt?: string | null;
};

export type ProjectHealthInput = {
  tasks: TaskHealthInput[];
  overdueMilestoneCount?: number;
  openWaitingCount?: number;
  openBlockerCount?: number;
  hasCriticalRisk?: boolean;
};

export type ProjectPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
