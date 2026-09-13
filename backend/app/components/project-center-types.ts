import type { AdminAccount, AdminPrincipal } from "../../lib/types";

export type ProjectCenterProps = {
  admin: AdminPrincipal;
  adminAccounts: AdminAccount[];
  showToast: (message: string) => void;
};

export type ProjectListItem = {
  id: number;
  name: string;
  code: string;
  venueName: string;
  currentPhase: string;
  executionStatus: string;
  healthStatus: string;
  healthReasons: string[];
  activityStartAt: string | null;
  activityEndAt: string | null;
  projectManager: { id: number | null; name: string };
  publishedTaskCount: number;
  doneTaskCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  updatedAt: string;
};

export type ProjectListResponse = {
  items: ProjectListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProjectDetail = {
  project: Record<string, unknown> & {
    id: number;
    code: string;
    name: string;
    status: string;
    health: string;
    venue_name: string;
    venue_contact_name: string;
    venue_contact_info: string;
    venue_address: string;
    activity_direction: string;
    activity_start_at: string | null;
    activity_end_at: string | null;
    move_in_at: string | null;
    move_out_at: string | null;
    scale_description: string;
    cooperation_mode: string;
    budget_range_text: string;
    known_constraints: string;
    priority: string;
    creation_basis: string;
    confirmed_items: string;
    unconfirmed_items: string;
    notes: string;
    created_at: string;
    updated_at: string;
  };
  currentPhase: Record<string, unknown> | null;
  healthReasons: string[];
  projectManager: { id: number; name: string; phone: string } | null;
  members: Array<Record<string, unknown>>;
  taskStats: { total: number; published: number; done: number; blocked: number; overdue: number };
  milestones: Array<Record<string, unknown>>;
  recentActivity: Array<Record<string, unknown>>;
};

export type ProjectPhase = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  gate_definition: string;
  status: string;
  owner_id: number | null;
  starts_at: string | null;
  due_at: string | null;
};

export type ProjectMilestone = {
  id: number;
  code: string;
  name: string;
  sort_order: number;
  acceptance_criteria: string;
  is_key: number;
  status: string;
  owner_id: number | null;
  due_at: string | null;
  completed_at: string | null;
};

export type ProjectTask = {
  id: number;
  code: string;
  title: string;
  description: string;
  status: string;
  phase_id: number | null;
  phase_name: string | null;
  owner_id: number | null;
  approver_id: number | null;
  due_at: string | null;
  is_key: number;
  deliverables: string;
  acceptance_criteria: string;
  blocker_reason: string;
  updated_at: string;
};

export type ProjectTaskResponse = {
  items: ProjectTask[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ProjectListFilters = {
  keyword: string;
  status: string;
  health: string;
  ownerId: string;
  activityStartFrom: string;
  activityStartTo: string;
  page: number;
  pageSize: number;
};

export type ProjectTaskFilters = {
  status: string;
  phaseId: string;
  ownerId: string;
  critical: boolean;
  page: number;
  pageSize: number;
};

export type ProjectCreateForm = {
  name: string;
  code: string;
  source: string;
  projectManagerId: string;
  venueName: string;
  venueContactName: string;
  venueContactInfo: string;
  venueAddress: string;
  activityDirection: string;
  activityStartAt: string;
  activityEndAt: string;
  moveInAt: string;
  moveOutAt: string;
  scaleDescription: string;
  cooperationMode: string;
  budgetRangeText: string;
  priority: string;
  creationBasis: string;
  confirmedItems: string;
  unconfirmedItems: string;
  knownConstraints: string;
  notes: string;
};
