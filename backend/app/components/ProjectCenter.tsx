"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "./client-request";
import styles from "./ProjectCenter.module.css";
import {
  formatDate,
  labelHealth,
  labelPhaseStatus,
  labelProjectStatus,
  labelSource,
  textValue,
} from "./project-center-formatters";
import type {
  ProjectCenterProps,
  ProjectCreateForm,
  ProjectDetail,
  ProjectListFilters,
  ProjectListItem,
  ProjectListResponse,
  ProjectMilestone,
  ProjectPhase,
} from "./project-center-types";
import { ProjectList } from "./project-center/ProjectList";
import { ProjectErrorState } from "./project-center/ProjectErrorState";
import { ProjectMembers } from "./project-center/ProjectMembers";
import { ProjectTasks } from "./project-center/ProjectTasks";
import { ProjectFiles } from "./project-center/ProjectFiles";
import { ProjectRecords } from "./project-center/ProjectRecords";
import { ProjectDashboard } from "./project-center/ProjectDashboard";
import { ProjectTimeline } from "./project-center/ProjectTimeline";
import { ProjectWork } from "./project-center/ProjectWork";
import { ProjectSettings } from "./project-center/ProjectSettings";

const sources = [
  ["CREATOR_CLUSTER", "主理人资源聚集"],
  ["CONCEPT_FIRST", "平台主动创意"],
  ["VENUE_REQUEST", "场地方需求"],
  ["EXISTING_RELATIONSHIP", "既有合作延续"],
] as const;

const initialFilters: ProjectListFilters = {
  keyword: "",
  status: "",
  health: "",
  ownerId: "",
  activityStartFrom: "",
  activityStartTo: "",
  page: 1,
  pageSize: 20,
};

const initialForm: ProjectCreateForm = {
  name: "",
  code: "",
  source: "VENUE_REQUEST",
  projectManagerId: "",
  venueName: "",
  venueContactName: "",
  venueContactInfo: "",
  venueAddress: "",
  activityDirection: "",
  activityStartAt: "",
  activityEndAt: "",
  moveInAt: "",
  moveOutAt: "",
  scaleDescription: "",
  cooperationMode: "",
  budgetRangeText: "",
  priority: "NORMAL",
  creationBasis: "",
  confirmedItems: "",
  unconfirmedItems: "",
  knownConstraints: "",
  notes: "",
};

function projectHealthClass(value: string) {
  return value === "RED" ? styles.red : value === "YELLOW" ? styles.yellow : styles.green;
}

function parseError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return fallback;
}

function redirectIfUnauthorized(status: number) {
  if (status === 401) {
    window.location.replace("/admin/login");
    return true;
  }
  return false;
}

export function ProjectCenter({ admin, adminAccounts, showToast }: ProjectCenterProps) {
  const [filters, setFilters] = useState(initialFilters);
  const [list, setList] = useState<ProjectListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [listErrorStatus, setListErrorStatus] = useState<number | undefined>();
  const [schemaNotReady, setSchemaNotReady] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createConfirm, setCreateConfirm] = useState(false);
  const [createForm, setCreateForm] = useState(initialForm);
  const [createError, setCreateError] = useState("");
  const [createFieldErrors, setCreateFieldErrors] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [requestedTaskId, setRequestedTaskId] = useState<number | undefined>();
  const [homeView, setHomeView] = useState<"dashboard" | "list" | "work">("dashboard");
  const [detail, setDetail] = useState<(ProjectDetail & { phases: ProjectPhase[]; milestones: ProjectMilestone[] }) | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailErrorStatus, setDetailErrorStatus] = useState<number | undefined>();
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const activeManagers = useMemo(
    () => adminAccounts.filter((account) => account.status === "active"),
    [adminAccounts],
  );

  const loadProjects = useCallback(async (nextFilters: ProjectListFilters) => {
    const requestId = ++listRequest.current;
    setListLoading(true);
    setListError("");
    setListErrorStatus(undefined);
    const params = new URLSearchParams({
      page: String(nextFilters.page),
      pageSize: String(nextFilters.pageSize),
    });
    if (nextFilters.keyword.trim()) params.set("keyword", nextFilters.keyword.trim());
    if (nextFilters.status) params.set("status", nextFilters.status);
    if (nextFilters.health) params.set("health", nextFilters.health);
    if (nextFilters.ownerId) params.set("ownerId", nextFilters.ownerId);
    if (nextFilters.activityStartFrom) params.set("activityStartFrom", nextFilters.activityStartFrom);
    if (nextFilters.activityStartTo) params.set("activityStartTo", nextFilters.activityStartTo);
    try {
      const { response, data } = await fetchJson(`/api/admin/projects?${params.toString()}`, { cache: "no-store" });
      if (requestId !== listRequest.current) return;
      if (redirectIfUnauthorized(response.status)) return;
      if (response.status === 503) {
        setSchemaNotReady(true);
        setList(null);
        return;
      }
      if (!response.ok) {
        setListErrorStatus(response.status);
        setListError(parseError(data, "项目列表加载失败"));
        return;
      }
      setSchemaNotReady(false);
      setList(data as ProjectListResponse);
    } catch (error) {
      if (requestId === listRequest.current) {
        setListError(error instanceof Error ? error.message : "项目列表加载失败");
      }
    } finally {
      if (requestId === listRequest.current) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProjects(filters), 280);
    return () => window.clearTimeout(timer);
  }, [filters, loadProjects]);

  async function openProject(projectId: number, taskId?: number) {
    const requestId = ++detailRequest.current;
    setSelectedProjectId(projectId);
    setRequestedTaskId(taskId);
    setDetail(null);
    setDetailError("");
    setDetailErrorStatus(undefined);
    setDetailLoading(true);
    try {
      const [detailResult, phasesResult, milestonesResult] = await Promise.all([
        fetchJson(`/api/admin/projects/${projectId}`, { cache: "no-store" }),
        fetchJson(`/api/admin/projects/${projectId}/phases`, { cache: "no-store" }),
        fetchJson(`/api/admin/projects/${projectId}/milestones`, { cache: "no-store" }),
      ]);
      if (requestId !== detailRequest.current) return;
      if (redirectIfUnauthorized(detailResult.response.status)) return;
      if (detailResult.response.status === 503) {
        setSchemaNotReady(true);
        setSelectedProjectId(null);
        return;
      }
      if (!detailResult.response.ok) {
        setDetailErrorStatus(detailResult.response.status);
        setDetailError(parseError(detailResult.data, "项目详情加载失败"));
        return;
      }
      if (!phasesResult.response.ok || !milestonesResult.response.ok) {
        setDetailErrorStatus(!phasesResult.response.ok ? phasesResult.response.status : milestonesResult.response.status);
        setDetailError(parseError(!phasesResult.response.ok ? phasesResult.data : milestonesResult.data, "项目结构加载失败"));
        return;
      }
      setDetail({
        ...(detailResult.data as ProjectDetail),
        phases: phasesResult.data.phases as ProjectPhase[],
        milestones: milestonesResult.data.milestones as ProjectMilestone[],
      } as ProjectDetail & { phases: ProjectPhase[]; milestones: ProjectMilestone[] });
    } catch (error) {
      if (requestId === detailRequest.current) {
        setDetailError(error instanceof Error ? error.message : "项目详情加载失败");
      }
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  }

  async function createProject() {
    setCreating(true);
    setCreateError("");
    setCreateFieldErrors({});
    try {
      const { response, data } = await fetchJson("/api/admin/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          projectManagerId: Number(createForm.projectManagerId),
        }),
      });
      if (redirectIfUnauthorized(response.status)) return;
      if (!response.ok) {
        setCreateConfirm(false);
        setCreateError(parseError(data, "项目创建失败"));
        setCreateFieldErrors(data && typeof data === "object" && "fieldErrors" in data && data.fieldErrors && typeof data.fieldErrors === "object"
          ? data.fieldErrors as Record<string, string>
          : {});
        return;
      }
      const result = data as { project: { id: number; code: string; name: string }; counts: { phases: number; milestones: number; draftTasks: number } };
      setCreateOpen(false);
      setCreateConfirm(false);
      setCreateForm(initialForm);
      showToast(`项目「${result.project.name}」已创建，代号 ${result.project.code}；已生成 ${result.counts.phases} 个阶段、${result.counts.milestones} 个里程碑和 ${result.counts.draftTasks} 个任务草稿`);
      await loadProjects({ ...filters, page: 1 });
      await openProject(result.project.id);
    } catch (error) {
      setCreateConfirm(false);
      setCreateError(error instanceof Error ? error.message : "项目创建失败");
      setCreateFieldErrors({});
    } finally {
      setCreating(false);
    }
  }

  function requestCreate() {
    const required: Array<[keyof ProjectCreateForm, string]> = [
      ["name", "项目名称"],
      ["projectManagerId", "平台内部项目经理"],
      ["venueName", "场地方名称"],
      ["venueContactName", "场地方联系人"],
      ["venueContactInfo", "联系方式"],
      ["activityDirection", "初步活动方向"],
      ["activityStartAt", "预计活动开始时间"],
      ["activityEndAt", "预计活动结束时间"],
      ["creationBasis", "创建依据"],
      ["confirmedItems", "已确认事项"],
      ["unconfirmedItems", "未确认事项"],
    ];
    const missing = required.find(([key]) => !createForm[key].trim());
    if (missing) {
      setCreateError(`${missing[1]}不能为空`);
      setCreateFieldErrors({ [missing[0]]: `${missing[1]}不能为空` });
      return;
    }
    const start = new Date(createForm.activityStartAt).getTime();
    const end = new Date(createForm.activityEndAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setCreateError("活动时间格式不正确");
      setCreateFieldErrors({ activityStartAt: "请输入有效时间", activityEndAt: "请输入有效时间" });
      return;
    }
    if (end < start) {
      setCreateError("活动结束时间不能早于开始时间");
      setCreateFieldErrors({ activityEndAt: "结束时间不能早于开始时间" });
      return;
    }
    if (createForm.moveInAt && createForm.moveOutAt) {
      const moveIn = new Date(createForm.moveInAt).getTime();
      const moveOut = new Date(createForm.moveOutAt).getTime();
      if (Number.isFinite(moveIn) && Number.isFinite(moveOut) && moveOut < moveIn) {
        setCreateError("撤场时间不能早于进场时间");
        setCreateFieldErrors({ moveOutAt: "撤场时间不能早于进场时间" });
        return;
      }
    }
    if (!activeManagers.some((manager) => String(manager.id) === createForm.projectManagerId)) {
      setCreateError("请选择仍处于启用状态的项目经理");
      setCreateFieldErrors({ projectManagerId: "请选择仍处于启用状态的项目经理" });
      return;
    }
    setCreateError("");
    setCreateFieldErrors({});
    setCreateConfirm(true);
  }

  function updateFilter<K extends keyof ProjectListFilters>(key: K, value: ProjectListFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value, page: key === "page" ? Number(value) : 1 }));
  }

  function closeCreate() {
    if (creating) return;
    setCreateOpen(false);
    setCreateConfirm(false);
    setCreateError("");
  }

  if (selectedProjectId !== null) {
    return (
      <ProjectDetailView
        admin={admin}
        adminAccounts={adminAccounts}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        errorStatus={detailErrorStatus}
        onBack={() => { setSelectedProjectId(null); setRequestedTaskId(undefined); setDetail(null); }}
        onRetry={() => void openProject(selectedProjectId)}
        initialTaskId={requestedTaskId}
      />
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.detailTabs}><button className={homeView === "dashboard" ? styles.active : ""} type="button" onClick={() => setHomeView("dashboard")}>项目总览</button><button className={homeView === "work" ? styles.active : ""} type="button" onClick={() => setHomeView("work")}>我的工作</button><button className={homeView === "list" ? styles.active : ""} type="button" onClick={() => setHomeView("list")}>项目列表</button></div>
      {homeView === "dashboard" ? <ProjectDashboard admin={admin} onOpenProject={(projectId) => void openProject(projectId)} /> : null}
      {homeView === "work" ? <ProjectWork admin={admin} onOpenProject={(projectId, taskId) => void openProject(projectId, taskId)} /> : null}
      {homeView === "list" ? <>
      <section className={styles.intro}>
        <div className={styles.introTitle}>
          <div>
            <p className={styles.eyebrow}>EXECUTION PROJECT CENTER</p>
            <h2>项目中台</h2>
            <p>管理已经正式确认并进入执行阶段的活动项目</p>
          </div>
          {admin.role === "super" ? (
            <button className="button primary" type="button" onClick={() => { setCreateOpen(true); setCreateError(""); }}>
              <Plus size={17} /> 新建项目
            </button>
          ) : null}
        </div>
        <p>只有已经人工确认的合作，才进入项目中台。</p>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.toolbarTop}>
          <strong>项目筛选</strong>
          <button className="button secondary" type="button" onClick={() => void loadProjects(filters)} disabled={listLoading}>
            <RefreshCw size={16} className={listLoading ? "spin" : ""} /> 刷新
          </button>
        </div>
        <div className={styles.filterGrid}>
          <label className={styles.field}><span>关键词</span><div className="input-with-icon"><Search size={16} /><input value={filters.keyword} onChange={(event) => updateFilter("keyword", event.target.value)} placeholder="项目名、代号或场地" /></div></label>
          <label className={styles.field}><span>执行状态</span><select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">全部状态</option><option value="ACTIVE">执行中</option><option value="PAUSED">已暂停</option><option value="COMPLETED">已完成</option><option value="CANCELLED">已取消</option><option value="ARCHIVED">已归档</option></select></label>
          <label className={styles.field}><span>健康度</span><select value={filters.health} onChange={(event) => updateFilter("health", event.target.value)}><option value="">全部健康度</option><option value="GREEN">健康</option><option value="YELLOW">需关注</option><option value="RED">有风险</option></select></label>
          <label className={styles.field}><span>项目经理</span><select value={filters.ownerId} onChange={(event) => updateFilter("ownerId", event.target.value)}><option value="">全部项目经理</option>{activeManagers.map((account) => <option key={account.id} value={account.id}>{account.name || account.phone}</option>)}</select></label>
          <label className={styles.field}><span>活动开始从</span><input type="date" value={filters.activityStartFrom} onChange={(event) => updateFilter("activityStartFrom", event.target.value)} /></label>
          <label className={styles.field}><span>活动开始至</span><input type="date" value={filters.activityStartTo} onChange={(event) => updateFilter("activityStartTo", event.target.value)} /></label>
        </div>
        <button className="text-button" type="button" onClick={() => setFilters(initialFilters)}>清除筛选</button>
      </section>

      {schemaNotReady ? <SchemaNotice /> : null}
      {listError ? <ProjectErrorState status={listErrorStatus} message={listError} onRetry={() => void loadProjects(filters)} /> : null}
      {!schemaNotReady && !listError && listLoading && !list ? <LoadingState label="正在读取项目列表" /> : null}
      {!schemaNotReady && !listError && list ? (
        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <div><h3>项目列表</h3><p>{list.total ? `共 ${list.total} 个项目` : "当前筛选条件下暂无项目"}</p></div>
            {listLoading ? <span className={styles.statusLine}><LoaderCircle size={16} className="spin" /> 更新中</span> : null}
          </div>
          {list.items.length ? <ProjectList items={list.items} onOpen={openProject} /> : <EmptyState filtered={Boolean(filters.keyword || filters.status || filters.health || filters.ownerId || filters.activityStartFrom || filters.activityStartTo)} />}
          {list.totalPages > 1 ? <Pagination page={list.page} totalPages={list.totalPages} onChange={(page) => updateFilter("page", page)} /> : null}
        </section>
      ) : null}

      {createOpen ? (
        <ProjectCreateModal
          form={createForm}
        error={createError}
        fieldErrors={createFieldErrors}
          submitting={creating}
          managers={activeManagers}
          onChange={(key, value) => setCreateForm((current) => ({ ...current, [key]: value }))}
          onClose={closeCreate}
          onSubmit={requestCreate}
        />
      ) : null}
      {createConfirm ? <CreateConfirmModal submitting={creating} onCancel={() => setCreateConfirm(false)} onConfirm={() => void createProject()} /> : null}
      </> : null}
    </div>
  );
}

function ProjectDetailView({
  admin,
  adminAccounts,
  detail,
  loading,
  error,
  errorStatus,
  onBack,
  onRetry,
  initialTaskId,
}: {
  admin: ProjectCenterProps["admin"];
  adminAccounts: ProjectCenterProps["adminAccounts"];
  detail: (ProjectDetail & { phases: ProjectPhase[]; milestones: ProjectMilestone[] }) | null;
  loading: boolean;
  error: string;
  errorStatus?: number;
  onBack: () => void;
  onRetry: () => void;
  initialTaskId?: number;
}) {
  const [tab, setTab] = useState<"overview" | "phases" | "milestones" | "tasks" | "members" | "files" | "records" | "timeline" | "settings">("overview");
  const [initialTaskIdState, setInitialTaskId] = useState<number | undefined>(initialTaskId);
  const [initialMilestoneId, setInitialMilestoneId] = useState<number | undefined>();
  useEffect(() => {
    if (initialTaskId) {
      setInitialTaskId(initialTaskId);
      setTab("tasks");
    }
  }, [initialTaskId]);
  if (loading && !detail) return <div className={styles.root}><button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回项目列表</button><LoadingState label="正在读取项目详情" /></div>;
  if (error || !detail) return <div className={styles.root}><button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回项目列表</button><ProjectErrorState status={errorStatus} message={error || "项目不存在"} onRetry={onRetry} /></div>;
  const { project, taskStats } = detail;
  return (
    <div className={styles.root}>
      <section className={styles.detailHeader}>
        <div className={styles.detailTop}>
          <div><button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> 项目列表</button><p className={styles.eyebrow}>项目详情 · {project.code}</p><h2>{project.name}</h2><p>{project.venue_name || "未填写场地"} · {labelSource(String(project.source || ""))}</p></div>
          <span className={`${styles.health} ${projectHealthClass(String(project.health || ""))}`}>{labelHealth(String(project.health || ""))}</span>
        </div>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}><span>当前阶段</span><strong>{detail.currentPhase ? textValue(detail.currentPhase.name) : "尚未开始"}</strong></div>
          <div className={styles.summaryCard}><span>任务进度</span><strong>{taskStats.done} / {taskStats.published}</strong></div>
          <div className={styles.summaryCard}><span>逾期任务</span><strong>{taskStats.overdue}</strong></div>
          <div className={styles.summaryCard}><span>阻塞任务</span><strong>{taskStats.blocked}</strong></div>
        </div>
        <div className={styles.detailTabs}>{(["overview", "members", "phases", "milestones", "tasks", "files", "records", "timeline", "settings"] as const).map((value) => <button key={value} className={tab === value ? styles.active : ""} type="button" onClick={() => setTab(value)}>{value === "overview" ? "项目情况" : value === "members" ? "参与人员" : value === "phases" ? "工作步骤" : value === "milestones" ? "重要日期" : value === "tasks" ? "安排工作" : value === "files" ? "项目文件" : value === "records" ? "沟通记录" : value === "timeline" ? "时间安排" : "基本信息"}</button>)}</div>
      </section>
      {tab === "overview" ? <OverviewTab detail={detail} /> : null}
      {tab === "members" ? <ProjectMembers projectId={project.id} members={detail.members as never[]} accounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} onChanged={onRetry} /> : null}
      {tab === "phases" ? <PhasesTab projectId={project.id} phases={detail.phases} adminAccounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} onChanged={onRetry} /> : null}
      {tab === "milestones" ? <MilestonesTab projectId={project.id} milestones={detail.milestones} adminAccounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} onChanged={onRetry} initialMilestoneId={initialMilestoneId} /> : null}
      {tab === "tasks" ? <ProjectTasks projectId={project.id} phases={detail.phases} admin={admin} adminAccounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} initialTaskId={initialTaskIdState} /> : null}
      {tab === "files" ? <ProjectFiles projectId={project.id} phases={detail.phases} admin={admin} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} canUpload={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && ["PROJECT_MANAGER", "MEMBER"].includes(String(member.role)))} /> : null}
      {tab === "records" ? <ProjectRecords projectId={project.id} admin={admin} accounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} canCreate={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && ["PROJECT_MANAGER", "MEMBER"].includes(String(member.role)))} /> : null}
      {tab === "timeline" ? <ProjectTimeline projectId={project.id} phases={detail.phases} milestones={detail.milestones} admin={admin} adminAccounts={adminAccounts} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} onChanged={onRetry} /> : null}
      {tab === "settings" ? <ProjectSettings projectId={project.id} projectStatus={String(project.status)} project={project} admin={admin} isSuper={admin.role === "super"} canManage={admin.role === "super" || detail.members.some((member) => Number(member.user_id) === admin.id && member.role === "PROJECT_MANAGER")} /> : null}
    </div>
  );
}

function OverviewTab({ detail }: { detail: ProjectDetail }) {
  const project = detail.project;
  const recordStats = (detail as ProjectDetail & { recordStats?: { openRisk: number; openIssue: number; highRisk: number } }).recordStats;
  const fields: Array<[string, unknown]> = [
    ["项目状态", labelProjectStatus(String(project.status || ""))],
    ["项目经理", detail.projectManager?.name || "未指定"],
    ["活动方向", project.activity_direction],
    ["活动时间", `${formatDate(project.activity_start_at, true)} 至 ${formatDate(project.activity_end_at, true)}`],
    ["进场时间", formatDate(project.move_in_at, true)],
    ["撤场时间", formatDate(project.move_out_at, true)],
    ["场地方联系人", `${textValue(project.venue_contact_name)} · ${textValue(project.venue_contact_info)}`],
    ["场地地址", project.venue_address],
    ["规模描述", project.scale_description],
    ["合作方式", project.cooperation_mode],
    ["预算区间", project.budget_range_text],
    ["优先级", project.priority],
    ["创建依据", project.creation_basis],
    ["已确认事项", project.confirmed_items],
    ["未确认事项", project.unconfirmed_items],
    ["已知约束", project.known_constraints],
    ["备注", project.notes],
  ];
  return <section className={styles.panel}><div className={styles.panelTitle}><div><h3>项目概览</h3><p>只读查看当前项目基础信息和执行风险。</p></div></div>{detail.healthReasons.length ? <div className={styles.notice}><strong><AlertTriangle size={16} /> 当前健康提示</strong><p>{detail.healthReasons.join(" · ")}</p></div> : null}<div className={styles.summaryGrid}><div className={styles.summaryCard}><span>未关闭风险</span><strong>{recordStats?.openRisk || 0}</strong></div><div className={styles.summaryCard}><span>未关闭问题</span><strong>{recordStats?.openIssue || 0}</strong></div><div className={styles.summaryCard}><span>高风险提醒</span><strong>{recordStats?.highRisk || 0}</strong></div></div><div className={styles.infoGrid}>{fields.map(([label, value]) => <div className={styles.infoItem} key={label}><label>{label}</label><p>{textValue(value)}</p></div>)}</div><div className={styles.activitySummary}><strong>最近项目操作</strong>{detail.recentActivity.length ? detail.recentActivity.slice(0, 5).map((activity) => <p key={String(activity.id)}>{textValue(activity.action)} · {formatDate(String(activity.created_at || ""), true)}</p>) : <p>暂无项目操作记录</p>}</div></section>;
}

function PhasesTab({ projectId, phases, adminAccounts, canManage, onChanged }: { projectId: number; phases: ProjectPhase[]; adminAccounts: ProjectCenterProps["adminAccounts"]; canManage: boolean; onChanged: () => void }) {
  const accounts = new Map(adminAccounts.map((account) => [account.id, account.name || account.phone]));
  const [editing, setEditing] = useState<ProjectPhase | null>(null);
  const [completing, setCompleting] = useState<ProjectPhase | null>(null);
  return <section className={styles.panel}><div className={styles.panelTitle}><div><h3>项目阶段</h3><p>按 P00 至 P11 展示系统生成的执行阶段。</p></div><span>{phases.length} 个阶段</span></div><div className={styles.detailList}>{[...phases].sort((a, b) => a.sort_order - b.sort_order).map((phase) => <div className={styles.detailRow} key={phase.id}><strong>{phase.code}</strong><div><strong>{phase.name}</strong><small>{phase.gate_definition || "未填写阶段门槛"}</small></div><span className={styles.badge}>{labelPhaseStatus(phase.status)}</span><span>{accounts.get(phase.owner_id || 0) || "未指定负责人"}<br />{formatDate(phase.starts_at)} 至 {formatDate(phase.due_at)}</span>{canManage && ["PENDING", "IN_PROGRESS"].includes(phase.status) ? <button className="button secondary" type="button" onClick={() => setCompleting(phase)}>完成阶段</button> : null}{canManage ? <button className="icon-button" type="button" aria-label={`编辑${phase.code}`} onClick={() => setEditing(phase)}>编辑</button> : null}</div>)}</div>{editing ? <PhaseEditModal projectId={projectId} phase={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} /> : null}{completing ? <PhaseCompleteModal projectId={projectId} phase={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); onChanged(); }} /> : null}</section>;
}

function MilestonesTab({ projectId, milestones, adminAccounts, canManage, onChanged, initialMilestoneId }: { projectId: number; milestones: ProjectMilestone[]; adminAccounts: ProjectCenterProps["adminAccounts"]; canManage: boolean; onChanged: () => void; initialMilestoneId?: number }) {
  const accounts = new Map(adminAccounts.map((account) => [account.id, account.name || account.phone]));
  const [editing, setEditing] = useState<ProjectMilestone | null>(null);
  const [completing, setCompleting] = useState<ProjectMilestone | null>(null);
  useEffect(() => {
    if (!initialMilestoneId) return;
    document.getElementById(`project-milestone-${initialMilestoneId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [initialMilestoneId]);
  return <section className={styles.panel}><div className={styles.panelTitle}><div><h3>项目里程碑</h3><p>按 M00 至 M13 展示关键验收节点。</p></div><span>{milestones.length} 个里程碑</span></div><div className={styles.detailList}>{[...milestones].sort((a, b) => a.sort_order - b.sort_order).map((milestone) => <div className={styles.detailRow} id={`project-milestone-${milestone.id}`} key={milestone.id}><strong>{milestone.code}</strong><div><strong>{milestone.name} {milestone.is_key ? <span className={styles.keyBadge}>关键</span> : null}</strong><small>{milestone.acceptance_criteria || "未填写验收标准"}</small></div><span className={styles.badge}>{labelPhaseStatus(milestone.status)}</span><span>负责人：{accounts.get(milestone.owner_id || 0) || "未指定"}<br />截止：{milestone.due_at ? formatDate(milestone.due_at) : "待项目经理安排"}<br />完成：{formatDate(milestone.completed_at)}</span>{canManage && milestone.status !== "COMPLETED" ? <button className="button secondary" type="button" onClick={() => setCompleting(milestone)}>完成</button> : null}{milestone.status === "COMPLETED" && canManage ? <button className="button secondary" type="button" onClick={() => setCompleting(milestone)}>重新打开</button> : null}{canManage ? <button className="icon-button" type="button" aria-label={`编辑${milestone.code}`} onClick={() => setEditing(milestone)}>编辑</button> : null}</div>)}</div>{editing ? <MilestoneEditModal projectId={projectId} milestone={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} /> : null}{completing ? <MilestoneCompleteModal projectId={projectId} milestone={completing} onClose={() => setCompleting(null)} onSaved={() => { setCompleting(null); onChanged(); }} /> : null}</section>;
}

function PhaseCompleteModal({ projectId, phase, onClose, onSaved }: { projectId: number; phase: ProjectPhase; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<"COMPLETE" | "SKIP">("COMPLETE");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/phases/${phase.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "SKIP" ? { action, reason: note } : { action, completionNote: note, exceptionReason: note }) });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "阶段操作失败"); else onSaved();
  }
  return <div className={styles.modalBackdrop}><section className={styles.modal}><header className={styles.modalHeader}><h2>{phase.code} · 阶段完成</h2></header><div className={styles.modalBody}><label className={styles.field}><span>操作</span><select value={action} onChange={(event) => setAction(event.target.value as "COMPLETE" | "SKIP")}><option value="COMPLETE">完成阶段</option><option value="SKIP">标记不适用并关闭</option></select></label><label className={`${styles.field} ${styles.wide}`}><span>{action === "SKIP" ? "关闭原因 *" : "完成说明或例外原因"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} required={action === "SKIP"} /></label>{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={() => void save()}>确认</button></footer></section></div>;
}

function MilestoneCompleteModal({ projectId, milestone, onClose, onSaved }: { projectId: number; milestone: ProjectMilestone; onClose: () => void; onSaved: () => void }) {
  const [action, setAction] = useState<"COMPLETE" | "REOPEN">(milestone.status === "COMPLETED" ? "REOPEN" : "COMPLETE");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    const result = await fetchJson(`/api/admin/projects/${projectId}/milestones/${milestone.id}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, completionNote: note, reason: note }) });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "里程碑操作失败"); else onSaved();
  }
  return <div className={styles.modalBackdrop}><section className={styles.modal}><header className={styles.modalHeader}><h2>{milestone.code} · 里程碑操作</h2></header><div className={styles.modalBody}><p>验收条件：{milestone.acceptance_criteria || "未填写"}</p><label className={`${styles.field} ${styles.wide}`}><span>{action === "REOPEN" ? "重新打开原因 *" : "完成说明 *"}</span><textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} required /></label>{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={() => void save()}>确认</button></footer></section></div>;
}

function PhaseEditModal({ projectId, phase, onClose, onSaved }: { projectId: number; phase: ProjectPhase; onClose: () => void; onSaved: () => void }) {
  const [startsAt, setStartsAt] = useState(phase.starts_at || "");
  const [dueAt, setDueAt] = useState(phase.due_at || "");
  const [gateDefinition, setGateDefinition] = useState(phase.gate_definition || "");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [affected, setAffected] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => { void fetchJson(`/api/admin/projects/${projectId}/tasks?phaseId=${phase.id}&page=1&pageSize=1`, { cache: "no-store" }).then((result) => { if (result.response.ok) setAffected(Number((result.data as { total?: number }).total || 0)); }); }, [phase.id, projectId]);
  const changedDate = startsAt !== (phase.starts_at || "") || dueAt !== (phase.due_at || "");
  async function save() {
    if (changedDate && !reason.trim()) { setError("日期变更必须填写原因"); return; }
    if (!confirm) { setConfirm(true); return; }
    const result = await fetchJson(`/api/admin/projects/${projectId}/phases/${phase.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ startsAt, dueAt, gateDefinition, changeReason: reason }) });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "阶段保存失败"); else onSaved();
  }
  return <div className={styles.modalBackdrop}><section className={styles.modal}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>PHASE EDIT</p><h2>编辑 {phase.code} · {phase.name}</h2></div></header><div className={styles.modalBody}><div className={styles.infoGrid}><div className={styles.infoItem}><label>开始时间（修改前）</label><p>{formatDate(phase.starts_at, true)}</p></div><div className={styles.infoItem}><label>截止时间（修改前）</label><p>{formatDate(phase.due_at, true)}</p></div><div className={styles.infoItem}><label>受影响任务</label><p>{affected} 项</p></div></div><div className={styles.formGrid}><label className={styles.field}><span>开始时间</span><input type="datetime-local" value={startsAt} onChange={(event) => { setStartsAt(event.target.value); setConfirm(false); }} /></label><label className={styles.field}><span>截止时间</span><input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setConfirm(false); }} /></label><label className={`${styles.field} ${styles.wide}`}><span>阶段门槛</span><textarea value={gateDefinition} onChange={(event) => setGateDefinition(event.target.value)} /></label>{changedDate ? <label className={`${styles.field} ${styles.wide}`}><span>日期修改原因 *</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}</div>{confirm ? <p className={styles.notice}>请再次确认：将把阶段日期从 {formatDate(phase.starts_at, true)} / {formatDate(phase.due_at, true)} 修改为 {formatDate(startsAt, true)} / {formatDate(dueAt, true)}。</p> : null}{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={() => void save()}>{confirm ? "确认保存" : "继续确认"}</button></footer></section></div>;
}

function MilestoneEditModal({ projectId, milestone, onClose, onSaved }: { projectId: number; milestone: ProjectMilestone; onClose: () => void; onSaved: () => void }) {
  const [dueAt, setDueAt] = useState(milestone.due_at || "");
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(milestone.acceptance_criteria || "");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [affected, setAffected] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => { void fetchJson(`/api/admin/projects/${projectId}/tasks?page=1&pageSize=100`, { cache: "no-store" }).then((result) => { if (result.response.ok) setAffected(((result.data as { items?: Array<{ milestone_id?: number }> }).items || []).filter((task) => task.milestone_id === milestone.id).length); }); }, [milestone.id, projectId]);
  const changedDate = dueAt !== (milestone.due_at || "");
  async function save() {
    if (changedDate && !reason.trim()) { setError("日期变更必须填写原因"); return; }
    if (!confirm) { setConfirm(true); return; }
    const result = await fetchJson(`/api/admin/projects/${projectId}/milestones/${milestone.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ dueAt, acceptanceCriteria, isKey: Boolean(milestone.is_key), changeReason: reason }) });
    if (!result.response.ok) setError(typeof result.data?.error === "string" ? result.data.error : "里程碑保存失败"); else onSaved();
  }
  return <div className={styles.modalBackdrop}><section className={styles.modal}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>MILESTONE EDIT</p><h2>编辑 {milestone.code} · {milestone.name}</h2></div></header><div className={styles.modalBody}><div className={styles.infoGrid}><div className={styles.infoItem}><label>目标时间（修改前）</label><p>{formatDate(milestone.due_at, true)}</p></div><div className={styles.infoItem}><label>受影响任务</label><p>{affected} 项</p></div></div><div className={styles.formGrid}><label className={styles.field}><span>目标时间</span><input type="datetime-local" value={dueAt} onChange={(event) => { setDueAt(event.target.value); setConfirm(false); }} /></label><label className={`${styles.field} ${styles.wide}`}><span>验收标准</span><textarea value={acceptanceCriteria} onChange={(event) => setAcceptanceCriteria(event.target.value)} /></label>{changedDate ? <label className={`${styles.field} ${styles.wide}`}><span>日期修改原因 *</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label> : null}</div>{confirm ? <p className={styles.notice}>请再次确认：将里程碑时间从 {formatDate(milestone.due_at, true)} 修改为 {formatDate(dueAt, true)}。</p> : null}{error ? <p className="form-error">{error}</p> : null}</div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" onClick={() => void save()}>{confirm ? "确认保存" : "继续确认"}</button></footer></section></div>;
}

function ProjectCreateModal({
  form,
  error,
  fieldErrors,
  submitting,
  managers,
  onChange,
  onClose,
  onSubmit,
}: {
  form: ProjectCreateForm;
  error: string;
  fieldErrors: Record<string, string>;
  submitting: boolean;
  managers: ProjectCenterProps["adminAccounts"];
  onChange: (key: keyof ProjectCreateForm, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  useEffect(() => {
    const firstKey = Object.keys(fieldErrors)[0];
    if (!firstKey) return;
    window.setTimeout(() => {
      document.querySelector<HTMLElement>(`[data-project-field="${firstKey}"] input, [data-project-field="${firstKey}"] textarea, [data-project-field="${firstKey}"] select`)?.focus();
    }, 0);
  }, [fieldErrors]);
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  const field = (key: keyof ProjectCreateForm, label: string, children: ReactNode) => <label className={`${styles.field} ${fieldErrors[key] ? styles.fieldError : ""}`}><span>{label}</span><span data-project-field={key}>{children}</span>{fieldErrors[key] ? <small className={styles.fieldErrorText}>{fieldErrors[key]}</small> : null}</label>;
  return <div className={styles.modalBackdrop} onMouseDown={onClose}><form className={styles.modal} onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><header className={styles.modalHeader}><div><p className={styles.eyebrow}>MANUAL PROJECT INTAKE</p><h2>新建项目</h2><p>只录入已经人工确认的合作。</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={18} /></button></header><div className={styles.modalBody}>
    <section className={styles.formSection}><h3>项目身份</h3><div className={styles.formGrid}>{field("name", "项目名称 *", <input value={form.name} onChange={(event) => onChange("name", event.target.value)} maxLength={160} required />)}{field("code", "项目代号", <input value={form.code} onChange={(event) => onChange("code", event.target.value)} maxLength={80} placeholder="留空自动生成" />)}{field("source", "项目来源 *", <select value={form.source} onChange={(event) => onChange("source", event.target.value)}>{sources.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>)}{field("projectManagerId", "平台内部项目经理 *", <select value={form.projectManagerId} onChange={(event) => onChange("projectManagerId", event.target.value)} required><option value="">请选择有效账号</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.name || manager.phone} · {manager.phone}</option>)}</select>)}</div></section>
    <section className={styles.formSection}><h3>场地与联系人</h3><div className={styles.formGrid}>{field("venueName", "场地方名称 *", <input value={form.venueName} onChange={(event) => onChange("venueName", event.target.value)} maxLength={160} required />)}{field("venueContactName", "联系人 *", <input value={form.venueContactName} onChange={(event) => onChange("venueContactName", event.target.value)} maxLength={80} required />)}{field("venueContactInfo", "联系方式 *", <input value={form.venueContactInfo} onChange={(event) => onChange("venueContactInfo", event.target.value)} maxLength={160} required />)}<label className={styles.field}><span>场地地址</span><input value={form.venueAddress} onChange={(event) => onChange("venueAddress", event.target.value)} maxLength={240} /></label></div></section>
    <section className={styles.formSection}><h3>活动信息</h3><div className={styles.formGrid}>{field("activityDirection", "初步活动方向 *", <textarea value={form.activityDirection} onChange={(event) => onChange("activityDirection", event.target.value)} maxLength={1000} required />)}{field("activityStartAt", "预计活动开始 *", <input type="datetime-local" value={form.activityStartAt} onChange={(event) => onChange("activityStartAt", event.target.value)} required />)}{field("activityEndAt", "预计活动结束 *", <input type="datetime-local" value={form.activityEndAt} onChange={(event) => onChange("activityEndAt", event.target.value)} required />)}{field("moveInAt", "预计进场", <input type="datetime-local" value={form.moveInAt} onChange={(event) => onChange("moveInAt", event.target.value)} />)}{field("moveOutAt", "预计撤场", <input type="datetime-local" value={form.moveOutAt} onChange={(event) => onChange("moveOutAt", event.target.value)} />)}<label className={styles.field}><span>规模描述</span><input value={form.scaleDescription} onChange={(event) => onChange("scaleDescription", event.target.value)} maxLength={500} /></label><label className={styles.field}><span>合作方式</span><input value={form.cooperationMode} onChange={(event) => onChange("cooperationMode", event.target.value)} maxLength={160} /></label><label className={styles.field}><span>预算区间</span><input value={form.budgetRangeText} onChange={(event) => onChange("budgetRangeText", event.target.value)} maxLength={160} /></label><label className={styles.field}><span>优先级</span><select value={form.priority} onChange={(event) => onChange("priority", event.target.value)}><option value="LOW">低</option><option value="NORMAL">普通</option><option value="HIGH">高</option><option value="URGENT">紧急</option></select></label></div></section>
    <section className={styles.formSection}><h3>立项依据</h3><div className={styles.formGrid}>{field("creationBasis", "创建依据 *", <textarea value={form.creationBasis} onChange={(event) => onChange("creationBasis", event.target.value)} maxLength={1000} required />)}{field("confirmedItems", "已确认事项 *", <textarea value={form.confirmedItems} onChange={(event) => onChange("confirmedItems", event.target.value)} maxLength={2000} required />)}{field("unconfirmedItems", "未确认事项 *", <textarea value={form.unconfirmedItems} onChange={(event) => onChange("unconfirmedItems", event.target.value)} maxLength={2000} required />)}<label className={`${styles.field} ${styles.wide}`}><span>已知约束</span><textarea value={form.knownConstraints} onChange={(event) => onChange("knownConstraints", event.target.value)} maxLength={1000} /></label><label className={`${styles.field} ${styles.wide}`}><span>备注</span><textarea value={form.notes} onChange={(event) => onChange("notes", event.target.value)} maxLength={2000} /></label></div></section>
    {error ? <p className="form-error">{error}</p> : null}
  </div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onClose} disabled={submitting}>取消</button><button className="button primary" type="submit" disabled={submitting}>{submitting ? "创建中" : "继续确认"}</button></footer></form></div>;
}

function CreateConfirmModal({ submitting, onCancel, onConfirm }: { submitting: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className={styles.modalBackdrop}><section className={`${styles.modal} ${styles.confirm}`} role="dialog" aria-modal="true" aria-labelledby="project-create-confirm-title"><header className={styles.modalHeader}><div><p className={styles.eyebrow}>FINAL CHECK</p><h2 id="project-create-confirm-title">确认正式创建项目？</h2></div></header><div className={styles.modalBody}><p>创建后，该合作将正式进入项目执行中台，并生成项目阶段、里程碑和任务草稿。</p><p>概念、浏览或口头兴趣不应在此创建项目。</p></div><footer className={styles.modalFooter}><button className="button secondary" type="button" onClick={onCancel} disabled={submitting}>返回检查</button><button className="button primary" type="button" onClick={onConfirm} disabled={submitting}>{submitting ? "创建中" : "确认创建"}</button></footer></section></div>;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return <div className={styles.pagination}><button className="icon-button" type="button" aria-label="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17} /></button><span>第 {page} / {totalPages} 页</span><button className="icon-button" type="button" aria-label="下一页" disabled={page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight size={17} /></button></div>;
}

function LoadingState({ label }: { label: string }) {
  return <section className={styles.panel}><div className={styles.empty}><LoaderCircle size={24} className="spin" /><p>{label}</p></div></section>;
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return <div className={styles.empty}><FolderKanban size={28} /><p>{filtered ? "当前筛选条件下没有项目。" : "还没有已确认并进入执行阶段的项目。"}</p></div>;
}

function SchemaNotice() {
  return <section className={styles.notice}><h3>项目中台尚未初始化</h3><p>项目中台功能已经接入，但当前数据库尚未完成初始化。请由管理员完成数据库迁移后再使用。</p></section>;
}
