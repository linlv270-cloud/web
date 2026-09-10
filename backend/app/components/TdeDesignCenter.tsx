"use client";

import {
  Archive,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Database,
  FileStack,
  Filter,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  Library,
  Menu,
  Palette,
  Presentation,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Moon,
  Contrast,
  Tags,
  Users,
  Wand2,
  X,
  type LucideProps,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useMemo, useState } from "react";

type IconComponent = ComponentType<LucideProps>;
type ReaderTheme = "light" | "dark" | "contrast";

type SectionId =
  | "workspace"
  | "projects"
  | "creators"
  | "venues"
  | "briefs"
  | "ppt"
  | "visuals"
  | "tasks"
  | "knowledge"
  | "archive"
  | "ai";

type NavItem = {
  id: SectionId;
  label: string;
  eyebrow: string;
  icon: IconComponent;
};

type Project = {
  id: string;
  name: string;
  venue: string;
  city: string;
  date: string;
  stage: string;
  progress: number;
  owner: string;
  priority: string;
  tone: string;
  tags: string[];
  next: string;
};

const navGroups: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "生产",
    items: [
      { id: "workspace", label: "工作台", eyebrow: "Today", icon: LayoutDashboard },
      { id: "projects", label: "项目库", eyebrow: "Projects", icon: FolderKanban },
      { id: "briefs", label: "Brief生成", eyebrow: "Brief", icon: Wand2 },
      { id: "ppt", label: "PPT方案", eyebrow: "Deck", icon: Presentation },
      { id: "visuals", label: "视觉模板", eyebrow: "Visual", icon: Palette },
      { id: "tasks", label: "任务卡", eyebrow: "Tasks", icon: ClipboardList },
    ],
  },
  {
    title: "资源",
    items: [
      { id: "creators", label: "主理人池", eyebrow: "Creators", icon: Users },
      { id: "venues", label: "场地项目", eyebrow: "Venues", icon: BriefcaseBusiness },
      { id: "knowledge", label: "知识库", eyebrow: "Library", icon: Library },
      { id: "archive", label: "生成归档", eyebrow: "Archive", icon: Archive },
      { id: "ai", label: "AI模型", eyebrow: "Models", icon: Bot },
    ],
  },
];

const projects: Project[] = [
  {
    id: "TDE-2609-001",
    name: "国庆七日幻野市集",
    venue: "静安大悦城屋顶花园",
    city: "上海",
    date: "2026.10.01-10.07",
    stage: "Brief生成",
    progress: 68,
    owner: "策划 Ada",
    priority: "高",
    tone: "超现实迷幻",
    tags: ["非遗文创", "手作人", "亲子家庭", "25-35女性", "首饰", "陶瓷", "咖啡", "怪诞山野"],
    next: "确认主理人组合与迷幻视觉模板",
  },
  {
    id: "TDE-2609-002",
    name: "冬日手作礼物企划",
    venue: "成都麓湖街区",
    city: "成都",
    date: "2026.12.18-12.20",
    stage: "场地提案",
    progress: 42,
    owner: "BD Lin",
    priority: "中",
    tone: "怪诞礼物",
    tags: ["节日礼物", "陶艺", "香氛", "情侣", "白领"],
    next: "补齐场地人流与预算字段",
  },
  {
    id: "TDE-2609-003",
    name: "春日花园体验课",
    venue: "杭州湖滨银泰",
    city: "杭州",
    date: "2027.03.28-03.29",
    stage: "模板待选",
    progress: 28,
    owner: "运营 May",
    priority: "低",
    tone: "幻觉花园",
    tags: ["植物", "体验课", "亲子", "花艺", "咖啡"],
    next: "等待主理人档期回传",
  },
];

const metrics = [
  { label: "进行中项目", value: "18", meta: "+4 本周", tone: "blue" },
  { label: "待生成Brief", value: "37", meta: "9 个高优先级", tone: "gold" },
  { label: "可邀主理人", value: "1,286", meta: "312 人国庆可约", tone: "green" },
  { label: "模板命中率", value: "86%", meta: "PPT与视觉合计", tone: "violet" },
];

const pipeline = [
  { label: "标签组合", status: "完成", icon: Tags },
  { label: "Brief生成", status: "进行中", icon: Sparkles },
  { label: "PPT初稿", status: "待开始", icon: Presentation },
  { label: "视觉模板", status: "待开始", icon: Palette },
  { label: "任务流转", status: "待开始", icon: ClipboardList },
  { label: "归档复用", status: "待开始", icon: Archive },
];

const creatorRows = [
  { name: "山也器物", role: "陶瓷主理人", city: "上海", score: 94, status: "可邀约", slots: "10.01-10.05", tags: ["山野灵感", "手作人", "亲子友好"] },
  { name: "银杏造物局", role: "首饰手作人", city: "苏州", score: 91, status: "待确认", slots: "10.03-10.07", tags: ["复古", "非遗文创", "25-35女性"] },
  { name: "一杯云咖啡", role: "美食主理人", city: "杭州", score: 88, status: "可邀约", slots: "10.01-10.07", tags: ["咖啡", "城市日常", "市井烟火"] },
  { name: "竹间微光", role: "手作体验", city: "上海", score: 85, status: "资料待补", slots: "10.02-10.04", tags: ["DIY", "亲子家庭", "自然风物"] },
];

const venueRows = [
  { name: "静安大悦城屋顶花园", city: "上海", status: "档期可谈", flow: "周末日均 3.2万", need: "国庆亲子与年轻女性客群活动" },
  { name: "成都麓湖街区", city: "成都", status: "等待预算", flow: "节假日峰值 1.8万", need: "冬季手作礼物市集" },
  { name: "杭州湖滨银泰", city: "杭州", status: "资料维护", flow: "商圈核心客流", need: "春日体验课与品牌快闪" },
];

const briefFields = [
  { label: "主题名", value: "幻野灯会 · 国庆怪诞市集" },
  { label: "核心客群", value: "亲子家庭、25-35岁女性、城市周末体验人群" },
  { label: "主理人组合", value: "非遗文创人、首饰手作人、陶瓷主理人、咖啡美食主理人" },
  { label: "视觉方向", value: "深色空间、酸性高亮、畸变网格、错位标题，高饱和撞色只进入模板预览" },
  { label: "场地卖点", value: "屋顶自然感、国庆长假、城市中心、适合打卡传播" },
];

const templates = [
  { name: "场地方初稿方案", type: "PPT 16:9", status: "可调用", fields: 42, tone: "稳重提案" },
  { name: "国庆市集主海报", type: "海报 3:4", status: "需替换主图", fields: 18, tone: "迷幻怪诞" },
  { name: "小红书九宫格", type: "传播图文", status: "可调用", fields: 27, tone: "错位杂志" },
  { name: "执行排期长图", type: "长图", status: "结构待补", fields: 31, tone: "暗色流程" },
];

const taskColumns = [
  {
    title: "待处理",
    tasks: [
      { name: "补全场地人流数据", owner: "BD Lin", due: "09.09", level: "高" },
      { name: "确认主理人档期交叉表", owner: "运营 May", due: "09.10", level: "高" },
    ],
  },
  {
    title: "进行中",
    tasks: [
      { name: "国庆主题 Brief v1", owner: "策划 Ada", due: "09.08", level: "高" },
      { name: "市集海报模板字段校验", owner: "设计 Qing", due: "09.11", level: "中" },
    ],
  },
  {
    title: "审核中",
    tasks: [
      { name: "场地方 PPT 12页结构", owner: "策划 Ada", due: "09.12", level: "中" },
    ],
  },
  {
    title: "已归档",
    tasks: [
      { name: "主理人资料卡字段规范", owner: "产品", due: "09.05", level: "低" },
    ],
  },
];

const knowledgeItems = [
  { title: "市集方案标准架构", type: "PPT结构", version: "v1.4", updated: "2026.09.06", tags: ["场地方", "招商", "市集"] },
  { title: "主理人标签字典", type: "标签规则", version: "v0.9", updated: "2026.09.05", tags: ["主理人", "画像", "档期"] },
  { title: "国庆节日主题词库", type: "趋势词", version: "v1.1", updated: "2026.09.07", tags: ["国庆", "复古", "亲子"] },
  { title: "视觉模板字段 Schema", type: "模板字段", version: "v0.6", updated: "2026.09.07", tags: ["海报", "PPT", "导出"] },
];

const archiveItems = [
  { id: "BRF-260907-018", title: "幻野灯会国庆市集 Brief", kind: "Brief", owner: "Ada", status: "已归档", cost: "2,418 tokens" },
  { id: "PPT-260907-006", title: "静安大悦城场地提案 v1", kind: "PPT", owner: "Ada", status: "待审核", cost: "6,912 tokens" },
  { id: "VIS-260907-011", title: "国庆市集主海报字段包", kind: "视觉", owner: "Qing", status: "模板待渲染", cost: "1,204 tokens" },
];

const aiModels = [
  { name: "OpenAI", use: "Brief与结构化字段", status: "待配置", budget: "0 / 20万 tokens" },
  { name: "DeepSeek", use: "长文草稿与知识库整理", status: "可接入", budget: "0 / 50万 tokens" },
  { name: "通义千问", use: "中文传播文案", status: "待配置", budget: "0 / 30万 tokens" },
  { name: "豆包", use: "小红书与公众号初稿", status: "待配置", budget: "0 / 30万 tokens" },
];

const pptSlides = [
  "封面与项目一句话",
  "场地机会与客群判断",
  "主题策略与内容结构",
  "主理人组合与摊位规划",
  "视觉方向与传播节奏",
  "执行排期与下一步动作",
];

const visualTokens = ["酸性绿", "电紫", "电青", "热雾橙", "畸变网格", "错位标题", "怪诞标签", "固定画布"];

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function TdeDesignCenter() {
  const [active, setActive] = useState<SectionId>("workspace");
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[1].name);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("light");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("tde-reader-theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "contrast") setReaderTheme(savedTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("tde-reader-theme", readerTheme);
  }, [readerTheme]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? projects[0],
    [selectedProjectId],
  );

  const currentNav = navGroups.flatMap((group) => group.items).find((item) => item.id === active);

  function switchSection(id: SectionId) {
    setActive(id);
    setSidebarOpen(false);
  }

  return (
    <main className="tde-center" data-theme={readerTheme}>
      <aside className={classNames("tde-sidebar", sidebarOpen && "is-open")}>
        <div className="tde-sidebar-head">
          <div className="tde-mark" aria-hidden="true">灯</div>
          <div>
            <strong>奇灯®TDE</strong>
            <span>TheDesignExpo.org.cn</span>
          </div>
          <button className="tde-icon-button tde-sidebar-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭导航">
            <X size={18} />
          </button>
        </div>

        <nav className="tde-nav" aria-label="设计策划生产中台">
          {navGroups.map((group) => (
            <div className="tde-nav-group" key={group.title}>
              <p>{group.title}</p>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    aria-current={active === item.id ? "page" : undefined}
                    aria-pressed={active === item.id}
                    className={classNames("tde-nav-item", active === item.id && "is-active")}
                    key={item.id}
                    type="button"
                    onClick={() => switchSection(item.id)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    <small>{item.eyebrow}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <a className="tde-legacy-link" href="/admin">
          <Database size={17} />
          <span>正式运营台</span>
          <ChevronRight size={16} />
        </a>
      </aside>

      {sidebarOpen ? <button className="tde-sidebar-scrim" type="button" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} /> : null}

      <section className="tde-main">
        <header className="tde-topbar">
          <button className="tde-icon-button tde-menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开导航">
            <Menu size={20} />
          </button>
          <div className="tde-top-title">
            <span>{currentNav?.eyebrow}</span>
            <h1>{currentNav?.label ?? "工作台"}</h1>
          </div>
          <label className="tde-search">
            <Search size={17} />
            <input aria-label="搜索项目、主理人、场地、模板" placeholder="搜索项目、主理人、场地、模板" />
          </label>
          <div className="tde-topbar-actions">
            <div className="tde-reading-controls" aria-label="阅读设置">
              <span>阅读设置</span>
              <button className={classNames("tde-reading-option", readerTheme === "light" && "is-active")} type="button" aria-pressed={readerTheme === "light"} onClick={() => setReaderTheme("light")}>
                <Sun size={16} />
                亮色
              </button>
              <button className={classNames("tde-reading-option", readerTheme === "dark" && "is-active")} type="button" aria-pressed={readerTheme === "dark"} onClick={() => setReaderTheme("dark")}>
                <Moon size={16} />
                暗色
              </button>
              <button className={classNames("tde-reading-option", readerTheme === "contrast" && "is-active")} type="button" aria-pressed={readerTheme === "contrast"} onClick={() => setReaderTheme("contrast")}>
                <Contrast size={16} />
                高对比
              </button>
            </div>
            <button className="tde-text-button" type="button">
              <Filter size={17} />
              筛选
            </button>
            <button className="tde-primary-button" type="button" onClick={() => switchSection("briefs")}>
              <Sparkles size={17} />
              生成Brief
            </button>
          </div>
        </header>

        <div className="tde-content">
          <section className="tde-context-strip">
            <div>
              <span>当前项目</span>
              <strong>{selectedProject.name}</strong>
            </div>
            <div>
              <span>活动档期</span>
              <strong>{selectedProject.date}</strong>
            </div>
            <div>
              <span>阶段</span>
              <strong>{selectedProject.stage}</strong>
            </div>
            <div>
              <span>负责人</span>
              <strong>{selectedProject.owner}</strong>
            </div>
          </section>

          {active === "workspace" ? <WorkspaceSection selectedProject={selectedProject} onSection={switchSection} /> : null}
          {active === "projects" ? <ProjectsSection selectedProjectId={selectedProjectId} onSelectProject={setSelectedProjectId} /> : null}
          {active === "creators" ? <CreatorsSection /> : null}
          {active === "venues" ? <VenuesSection /> : null}
          {active === "briefs" ? <BriefSection selectedProject={selectedProject} /> : null}
          {active === "ppt" ? <PptSection /> : null}
          {active === "visuals" ? <VisualsSection selectedTemplate={selectedTemplate} onSelectTemplate={setSelectedTemplate} /> : null}
          {active === "tasks" ? <TasksSection /> : null}
          {active === "knowledge" ? <KnowledgeSection /> : null}
          {active === "archive" ? <ArchiveSection /> : null}
          {active === "ai" ? <AiSection /> : null}
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="tde-section-head">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "red" | "gold" | "green" | "blue" }) {
  return <span className={classNames("tde-badge", `is-${tone}`)}>{children}</span>;
}

function WorkspaceSection({ selectedProject, onSection }: { selectedProject: Project; onSection: (id: SectionId) => void }) {
  return (
    <div className="tde-stack">
      <section className="tde-metrics" aria-label="关键数据">
        {metrics.map((metric) => (
          <article className={classNames("tde-metric", `is-${metric.tone}`)} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.meta}</small>
          </article>
        ))}
      </section>

      <section className="tde-work-grid">
        <article className="tde-focus-project">
          <SectionHeader
            eyebrow="Active Project"
            title={selectedProject.name}
            action={<StatusBadge tone="gold">{selectedProject.stage}</StatusBadge>}
          />
          <div className="tde-project-meta">
            <span><CalendarDays size={16} />{selectedProject.date}</span>
            <span><BriefcaseBusiness size={16} />{selectedProject.venue}</span>
            <span><Palette size={16} />{selectedProject.tone}</span>
          </div>
          <div className="tde-progress">
            <div><span>生产进度</span><strong>{selectedProject.progress}%</strong></div>
            <i style={{ width: `${selectedProject.progress}%` }} />
          </div>
          <div className="tde-tag-row">
            {selectedProject.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <div className="tde-action-row">
            <button className="tde-primary-button" type="button" onClick={() => onSection("briefs")}>
              <Wand2 size={17} />
              打开Brief
            </button>
            <button className="tde-text-button" type="button" onClick={() => onSection("visuals")}>
              <ImageIcon size={17} />
              视觉模板
            </button>
          </div>
        </article>

        <article className="tde-brief-preview">
          <SectionHeader eyebrow="Brief Preview" title="生成字段预览" action={<StatusBadge tone="green">结构化</StatusBadge>} />
          <dl>
            {briefFields.slice(0, 4).map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>

      <section className="tde-pipeline">
        <SectionHeader eyebrow="Flow" title="从标签到交付的生产链路" />
        <div>
          {pipeline.map((step, index) => {
            const Icon = step.icon;
            return (
              <article key={step.label}>
                <Icon size={18} />
                <span>{step.label}</span>
                <small>{step.status}</small>
                {index < pipeline.length - 1 ? <i aria-hidden="true" /> : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="tde-two-columns">
        <TemplateQueue />
        <TaskDigest />
      </section>
    </div>
  );
}

function ProjectsSection({ selectedProjectId, onSelectProject }: { selectedProjectId: string; onSelectProject: (id: string) => void }) {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Project Library"
        title="项目库"
        action={<button className="tde-primary-button" type="button"><FolderKanban size={17} />新建项目</button>}
      />
      <section className="tde-project-list">
        {projects.map((project) => (
          <button
            className={classNames("tde-project-card", selectedProjectId === project.id && "is-selected")}
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
          >
            <div>
              <span>{project.id}</span>
              <StatusBadge tone={project.priority === "高" ? "red" : project.priority === "中" ? "gold" : "neutral"}>{project.priority}</StatusBadge>
            </div>
            <h3>{project.name}</h3>
            <p>{project.venue} · {project.city} · {project.date}</p>
            <div className="tde-progress is-compact">
              <i style={{ width: `${project.progress}%` }} />
            </div>
            <footer>
              <span>{project.stage}</span>
              <strong>{project.next}</strong>
            </footer>
          </button>
        ))}
      </section>
    </div>
  );
}

function CreatorsSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Creator Pool"
        title="主理人池"
        action={<button className="tde-text-button" type="button"><Tags size={17} />标签管理</button>}
      />
      <section className="tde-filter-band">
        {["国庆可约", "上海及周边", "非遗文创", "亲子友好", "迷幻怪诞", "咖啡陶瓷"].map((tag) => (
          <button className={tag === "国庆可约" ? "is-active" : ""} key={tag} type="button">{tag}</button>
        ))}
      </section>
      <section className="tde-data-table" aria-label="主理人列表">
        <div className="tde-data-head">
          <span>主理人</span>
          <span>城市</span>
          <span>档期</span>
          <span>匹配</span>
          <span>状态</span>
        </div>
        {creatorRows.map((creator) => (
          <article key={creator.name}>
            <div>
              <strong>{creator.name}</strong>
              <small>{creator.role}</small>
              <div className="tde-tag-row is-small">{creator.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            </div>
            <span>{creator.city}</span>
            <span>{creator.slots}</span>
            <strong>{creator.score}</strong>
            <StatusBadge tone={creator.status === "可邀约" ? "green" : creator.status === "待确认" ? "gold" : "neutral"}>{creator.status}</StatusBadge>
          </article>
        ))}
      </section>
    </div>
  );
}

function VenuesSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Venue Projects"
        title="场地项目"
        action={<button className="tde-primary-button" type="button"><BriefcaseBusiness size={17} />新增场地</button>}
      />
      <section className="tde-venue-grid">
        {venueRows.map((venue) => (
          <article className="tde-venue-card" key={venue.name}>
            <div>
              <h3>{venue.name}</h3>
              <StatusBadge tone={venue.status === "档期可谈" ? "green" : venue.status === "等待预算" ? "gold" : "neutral"}>{venue.status}</StatusBadge>
            </div>
            <p>{venue.city}</p>
            <dl>
              <div><dt>客流</dt><dd>{venue.flow}</dd></div>
              <div><dt>需求</dt><dd>{venue.need}</dd></div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}

function BriefSection({ selectedProject }: { selectedProject: Project }) {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Brief Generator"
        title="Brief生成"
        action={<button className="tde-primary-button" type="button"><Sparkles size={17} />生成新版本</button>}
      />
      <section className="tde-brief-layout">
        <article className="tde-field-builder">
          <h3>标签组合</h3>
          <div className="tde-tag-row">
            {selectedProject.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <label>
            <span>场地约束</span>
            <textarea value="屋顶花园、国庆长假、亲子友好、适合拍照传播、需要咖啡与轻食动线。" readOnly />
          </label>
          <label>
            <span>生成目标</span>
            <select defaultValue="venue">
              <option value="venue">场地方提案 Brief</option>
              <option value="visual">视觉设计 Brief</option>
              <option value="ppt">PPT 方案 Brief</option>
            </select>
          </label>
        </article>

        <article className="tde-brief-document">
          <header>
            <span>BRF-260907-018</span>
            <StatusBadge tone="gold">待审核</StatusBadge>
          </header>
          <h3>幻野灯会 · 国庆怪诞市集</h3>
          <dl>
            {briefFields.map((field) => (
              <div key={field.label}>
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </article>
      </section>
    </div>
  );
}

function PptSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Deck Studio"
        title="PPT方案"
        action={<button className="tde-primary-button" type="button"><Presentation size={17} />生成初稿</button>}
      />
      <section className="tde-ppt-layout">
        <article className="tde-slide-preview">
          <div>
            <span>奇灯®TDE</span>
            <h3>幻野灯会 · 国庆怪诞市集</h3>
            <p>场地方初稿方案</p>
            <small>TheDesignExpo.org.cn</small>
          </div>
        </article>
        <article className="tde-slide-list">
          {pptSlides.map((slide, index) => (
            <button key={slide} type="button">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{slide}</strong>
              <ChevronRight size={16} />
            </button>
          ))}
        </article>
      </section>
    </div>
  );
}

function VisualsSection({ selectedTemplate, onSelectTemplate }: { selectedTemplate: string; onSelectTemplate: (name: string) => void }) {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Visual Templates"
        title="视觉模板"
        action={<button className="tde-primary-button" type="button"><ImageIcon size={17} />渲染预览</button>}
      />
      <section className="tde-visual-layout">
        <div className="tde-template-grid">
          {templates.map((template) => (
            <button
              className={classNames("tde-template-card", selectedTemplate === template.name && "is-selected")}
              key={template.name}
              type="button"
              onClick={() => onSelectTemplate(template.name)}
            >
              <span>{template.type}</span>
              <strong>{template.name}</strong>
              <small>{template.fields} 个字段 · {template.tone}</small>
              <StatusBadge tone={template.status === "可调用" ? "green" : template.status === "需替换主图" ? "gold" : "neutral"}>{template.status}</StatusBadge>
            </button>
          ))}
        </div>
        <article className="tde-poster-preview">
          <div className="tde-poster-canvas">
            <span>奇灯®TDE</span>
            <h3>幻野灯会</h3>
            <p>国庆怪诞市集</p>
            <div>
              {visualTokens.slice(0, 4).map((token) => <b key={token}>{token}</b>)}
            </div>
            <small>2026.10.01-10.07 · 上海</small>
          </div>
        </article>
      </section>
    </div>
  );
}

function TasksSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Task Cards"
        title="任务卡"
        action={<button className="tde-primary-button" type="button"><ClipboardList size={17} />新增任务</button>}
      />
      <section className="tde-kanban">
        {taskColumns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            {column.tasks.map((task) => (
              <article key={task.name}>
                <div>
                  <strong>{task.name}</strong>
                  <StatusBadge tone={task.level === "高" ? "red" : task.level === "中" ? "gold" : "neutral"}>{task.level}</StatusBadge>
                </div>
                <p>{task.owner}</p>
                <small><Clock3 size={14} />{task.due}</small>
              </article>
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}

function KnowledgeSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Knowledge Base"
        title="知识库"
        action={<button className="tde-text-button" type="button"><FileStack size={17} />版本记录</button>}
      />
      <section className="tde-knowledge-grid">
        {knowledgeItems.map((item) => (
          <article key={item.title}>
            <span>{item.type}</span>
            <h3>{item.title}</h3>
            <p>{item.version} · {item.updated}</p>
            <div className="tde-tag-row is-small">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ArchiveSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="Generation Archive"
        title="生成归档"
        action={<button className="tde-text-button" type="button"><Archive size={17} />归档策略</button>}
      />
      <section className="tde-data-table" aria-label="生成归档列表">
        <div className="tde-data-head">
          <span>编号</span>
          <span>名称</span>
          <span>类型</span>
          <span>状态</span>
          <span>消耗</span>
        </div>
        {archiveItems.map((item) => (
          <article key={item.id}>
            <strong>{item.id}</strong>
            <div>
              <strong>{item.title}</strong>
              <small>{item.owner}</small>
            </div>
            <span>{item.kind}</span>
            <StatusBadge tone={item.status === "已归档" ? "green" : item.status === "待审核" ? "gold" : "neutral"}>{item.status}</StatusBadge>
            <span>{item.cost}</span>
          </article>
        ))}
      </section>
    </div>
  );
}

function AiSection() {
  return (
    <div className="tde-stack">
      <SectionHeader
        eyebrow="AI Models"
        title="AI模型"
        action={<button className="tde-primary-button" type="button"><Settings2 size={17} />模型配置</button>}
      />
      <section className="tde-ai-grid">
        {aiModels.map((model) => (
          <article key={model.name}>
            <div>
              <Bot size={18} />
              <StatusBadge tone={model.status === "可接入" ? "green" : "neutral"}>{model.status}</StatusBadge>
            </div>
            <h3>{model.name}</h3>
            <p>{model.use}</p>
            <small>{model.budget}</small>
          </article>
        ))}
      </section>
    </div>
  );
}

function TemplateQueue() {
  return (
    <article className="tde-widget">
      <SectionHeader eyebrow="Templates" title="模板队列" />
      <div className="tde-template-list">
        {templates.map((template) => (
          <div key={template.name}>
            <span>{template.type}</span>
            <strong>{template.name}</strong>
            <small>{template.status}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function TaskDigest() {
  return (
    <article className="tde-widget">
      <SectionHeader eyebrow="Tasks" title="今日任务" action={<StatusBadge tone="red">4 高优先级</StatusBadge>} />
      <div className="tde-task-digest">
        {taskColumns.flatMap((column) => column.tasks).slice(0, 4).map((task) => (
          <div key={task.name}>
            <CheckCircle2 size={17} />
            <strong>{task.name}</strong>
            <span>{task.owner}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
