"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, LoaderCircle, MapPin, Sparkles, X } from "lucide-react";
import { saveBlobWithPicker } from "../lib/download";
import { CustomSelect } from "./CustomSelect";
import { DownloadLinkDialog } from "./DownloadLinkDialog";

export type PlanningTag = {
  id: number;
  ids: number[];
  label: string;
  category: "";
};

export type PlanningCreator = {
  id: number;
  userName: string;
  brandName: string;
  intro: string;
  logoUrl: string | null;
  tags: Array<{ id: number; label: string; category: string }>;
  busyPeriods: { startDate: string; endDate: string }[];
  noBookings: boolean;
  scheduleConfirmedAt: string | null;
};

export type PlanningPlan = {
  id: number;
  planDate: string;
  startDate: string;
  endDate: string;
  province: string;
  city: string;
  source: "manual" | "ai" | "resource";
  title: string;
  description: string;
};

export type PlanningLogoCreator = {
  id: number;
  brandName: string;
  logoUrl: string | null;
};

export type PlanningLocationProvince = {
  code: string;
  name: string;
  cities: { code: string; name: string }[];
};

type Props = {
  plans: PlanningPlan[];
  logoCreators: PlanningLogoCreator[];
  selectedPlanId: number | null;
  accessScope: "all" | "province" | "city";
  locationProvince: string;
  locationCity: string;
  locations: PlanningLocationProvince[];
  plansLoading: boolean;
  onLocationChange: (province: string, city: string) => void;
  onSelectPlan: (planId: number | null) => void;
};

type CalendarCell = { date: string; day: number; currentMonth: boolean };
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function toDateId(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateId(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day || 1);
}

function calendarCells(month: Date): CalendarCell[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: toDateId(date), day: date.getDate(), currentMonth: date.getMonth() === month.getMonth() };
  });
}

function formatDate(value: string) {
  const date = parseDateId(value);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function planDateLabel(plan: PlanningPlan) {
  return plan.startDate === plan.endDate ? plan.startDate : `${plan.startDate} 至 ${plan.endDate}`;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 60) || "活动主题";
}

function LogoTile({ creator, onPreview }: { creator: PlanningLogoCreator; onPreview: () => void }) {
  const [failed, setFailed] = useState(false);
  const name = creator.brandName || "主理人";
  const initial = Array.from(name.trim())[0] || "T";
  return (
    <button type="button" className="venue-logo-entry" onClick={onPreview} aria-label={`预览${name}主理人分享页`}>
      <span className="venue-logo-tile" aria-hidden="true">
        {creator.logoUrl && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.logoUrl} alt="" onError={() => setFailed(true)} />
        ) : <span>{initial}</span>}
      </span>
      <strong title={name}>{name}</strong>
    </button>
  );
}

function CreatorProfilePreview({ creator, onClose }: { creator: PlanningLogoCreator; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <div className="venue-creator-preview-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="venue-creator-preview" role="dialog" aria-modal="true" aria-label={`${creator.brandName || "主理人"}分享页预览`}>
        {loading ? <div className="venue-creator-preview-loading" role="status" aria-label="正在加载主理人分享页"><LoaderCircle className="spin" size={22} aria-hidden="true" /></div> : null}
        <iframe
          src={`/creator.html?id=${encodeURIComponent(String(creator.id))}`}
          title={`${creator.brandName || "主理人"}分享页预览`}
          onLoad={() => setLoading(false)}
        />
        <button ref={closeRef} type="button" className="venue-creator-preview-close" onClick={onClose} title="关闭预览" aria-label="关闭主理人预览"><X size={20} /></button>
      </section>
    </div>
  );
}

function CreatorLogoWall({ creators }: { creators: PlanningLogoCreator[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(6);
  const [page, setPage] = useState(1);
  const [previewCreator, setPreviewCreator] = useState<PlanningLogoCreator | null>(null);
  const pageSize = columns * 4;
  const totalPages = Math.max(1, Math.ceil(creators.length / pageSize));
  const visibleCreators = useMemo(() => creators.slice((page - 1) * pageSize, page * pageSize), [creators, page, pageSize]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateColumns = () => {
      const width = container.clientWidth;
      setColumns(width < 430 ? 3 : width < 620 ? 4 : width < 780 ? 5 : 6);
    };
    updateColumns();
    const observer = new ResizeObserver(updateColumns);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="venue-logo-wall" ref={containerRef} style={{ "--logo-columns": columns } as CSSProperties}>
      <div className="venue-logo-grid">
        {visibleCreators.map((creator) => <LogoTile key={creator.id} creator={creator} onPreview={() => setPreviewCreator(creator)} />)}
      </div>
      {totalPages > 1 ? (
        <nav className="venue-logo-pagination" aria-label="主理人标识翻页">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} title="上一页" aria-label="上一页"><ChevronLeft size={18} /></button>
          <span>{page} / {totalPages}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} title="下一页" aria-label="下一页"><ChevronRight size={18} /></button>
        </nav>
      ) : null}
      {previewCreator ? <CreatorProfilePreview creator={previewCreator} onClose={() => setPreviewCreator(null)} /> : null}
    </div>
  );
}

function PlanningLocationSelector({
  accessScope,
  province,
  city,
  locations,
  onChange,
}: {
  accessScope: Props["accessScope"];
  province: string;
  city: string;
  locations: PlanningLocationProvince[];
  onChange: Props["onLocationChange"];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionLocked = accessScope !== "all";
  const selectedProvince = locations.find((item) => item.name === province);
  const provinceOptions = accessScope === "all"
    ? locations.map((item) => ({ value: item.name, label: item.name }))
    : province ? [{ value: province, label: province }] : [];
  const cityOptions = selectedProvince?.cities.map((item) => ({ value: item.name, label: item.name })) || [];
  const label = accessScope === "province"
    ? `${province} / 全省`
    : province && city ? `${province} / ${city}` : province ? `${province} / 选择城市` : "选择省市";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="venue-location-selector" ref={containerRef}>
      <button
        type="button"
        className="venue-location-button"
        disabled={selectionLocked}
        onClick={() => setOpen((value) => !value)}
        aria-label={selectionLocked ? `当前授权范围：${label}` : `选择灵感日历城市，当前：${label}`}
        aria-expanded={selectionLocked ? undefined : open}
      >
        <MapPin size={15} aria-hidden="true" />
        <span>{label}</span>
        {!selectionLocked ? <ChevronDown size={14} className={open ? "expanded" : ""} aria-hidden="true" /> : null}
      </button>
      {open && !selectionLocked ? (
        <div className="venue-location-popover">
          <div className="venue-location-field"><span>省份</span><CustomSelect value={province} onChange={(value) => onChange(value, "")} options={provinceOptions} placeholder="请选择省份" /></div>
          <div className="venue-location-field"><span>城市</span><CustomSelect value={city} onChange={(value) => { onChange(province, value); if (value) setOpen(false); }} options={cityOptions} placeholder={province ? "请选择城市" : "请先选择省份"} disabled={!province} /></div>
        </div>
      ) : null}
    </div>
  );
}

export function VenuePlanningDashboard({
  plans,
  logoCreators,
  selectedPlanId,
  accessScope,
  locationProvince,
  locationCity,
  locations,
  plansLoading,
  onLocationChange,
  onSelectPlan,
}: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const [downloadInfo, setDownloadInfo] = useState<{ pageUrl: string; originalName: string; size: number; expiresAt: number } | null>(null);

  const cells = useMemo(() => calendarCells(month), [month]);
  const currentMonthLabel = `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`;
  const selectedPlans = useMemo(
    () => selectedDate ? plans.filter((plan) => plan.startDate <= selectedDate && plan.endDate >= selectedDate) : [],
    [plans, selectedDate],
  );
  const selectedPlan = selectedPlans.find((plan) => plan.id === selectedPlanId) || null;
  const hasLocation = accessScope === "province" ? Boolean(locationProvince) : Boolean(locationCity);

  const selectDate = (date: string) => {
    const datePlans = plans.filter((plan) => plan.startDate <= date && plan.endDate >= date);
    setSelectedDate(date);
    onSelectPlan(datePlans[0]?.id || null);
  };

  const exportPlanningDeck = async () => {
    if (!selectedPlan) return;
    setExporting(true);
    setExportError("");
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const pptx = new PptxGenJS();
      pptx.layout = "LAYOUT_WIDE";
      pptx.author = "TDE";
      pptx.company = "TDE";
      pptx.subject = `${selectedPlan.title} 活动草案`;
      pptx.title = selectedPlan.title;
      pptx.theme = { headFontFace: "Microsoft YaHei", bodyFontFace: "Microsoft YaHei" };
      const ink = "303733";
      const text = "59615B";
      const muted = "7B827C";
      const paper = "F4F2EC";
      const line = "D4D2CB";

      const cover = pptx.addSlide();
      cover.background = { color: paper };
      cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.2, h: 7.5, fill: { color: ink }, line: { color: ink } });
      cover.addText("TDE", { x: 0.75, y: 0.55, w: 3.2, h: 0.35, fontSize: 14, bold: true, color: ink, margin: 0 });
      cover.addText("活动草案", { x: 0.75, y: 1.45, w: 4.2, h: 0.5, fontSize: 22, color: muted, margin: 0 });
      cover.addText(selectedPlan.title, { x: 0.75, y: 2.05, w: 10.9, h: 1.25, fontSize: 36, bold: true, color: ink, margin: 0, valign: "middle" });
      cover.addText(`${selectedPlan.city}  ·  ${planDateLabel(selectedPlan)}`, { x: 0.75, y: 3.5, w: 10.5, h: 0.45, fontSize: 18, color: text, margin: 0 });
      cover.addShape(pptx.ShapeType.line, { x: 0.75, y: 6.55, w: 11.8, h: 0, line: { color: line, width: 1 } });
      cover.addText("小众&创意主理人名录可视化平台", { x: 0.75, y: 6.78, w: 5, h: 0.3, fontSize: 11, color: muted, margin: 0 });

      const proposal = pptx.addSlide();
      proposal.background = { color: "FFFFFF" };
      proposal.addText("01  活动主题与简介", { x: 0.65, y: 0.45, w: 6.5, h: 0.42, fontSize: 21, bold: true, color: ink, margin: 0 });
      proposal.addShape(pptx.ShapeType.line, { x: 0.65, y: 1.05, w: 12, h: 0, line: { color: ink, width: 1.2 } });
      proposal.addText(selectedPlan.title, { x: 0.65, y: 1.45, w: 11.8, h: 0.8, fontSize: 30, bold: true, color: ink, margin: 0, valign: "middle" });
      proposal.addText(selectedPlan.description || "暂无方案简介", { x: 0.65, y: 2.55, w: 11.8, h: 2.7, fontSize: 18, color: text, margin: 0, breakLine: false, valign: "top" });
      proposal.addText(`活动城市  ${selectedPlan.city}\n活动日期  ${planDateLabel(selectedPlan)}`, { x: 0.65, y: 5.65, w: 8.5, h: 0.8, fontSize: 14, color: muted, margin: 0.02 });

      const blob = await pptx.write({ outputType: "blob" }) as Blob;
      const fileName = `${safeFileName(selectedPlan.title)}（草案）.pptx`;
      const isMobile = !window.matchMedia("(pointer: fine)").matches || /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent);
      if (isMobile) {
        const formData = new FormData();
        formData.append("file", blob, fileName);
        const response = await fetch("/api/viz/temp-upload", { method: "POST", body: formData });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.token) throw new Error(data.error || "生成下载链接失败");
        setDownloadInfo({ pageUrl: `/download/${data.token}`, originalName: data.originalName || fileName, size: data.size || blob.size, expiresAt: data.expiresAt });
      } else {
        const result = await saveBlobWithPicker(blob, fileName, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        if (result === "cancelled") return;
      }
      const logResponse = await fetch("/api/viz/downloads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ downloadType: "inspiration", creatorIds: [], fileName, planId: selectedPlan.id }),
      });
      if (!logResponse.ok) console.error("下载记录保存失败", await logResponse.text());
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "活动草案生成失败");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="venue-planning" aria-label="灵感">
      <div className="venue-planning-location">
        <PlanningLocationSelector accessScope={accessScope} province={locationProvince} city={locationCity} locations={locations} onChange={onLocationChange} />
      </div>
      <div className="venue-planning-grid">
        <section className="venue-calendar-panel" aria-label="灵感日历">
          <div className="venue-calendar-title">
            <div><CalendarDays size={18} aria-hidden="true" /><h2>{currentMonthLabel}</h2></div>
            <div className="venue-calendar-nav">
              <button type="button" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))} title="上个月" aria-label="上个月"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => setMonth((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))} title="下个月" aria-label="下个月"><ChevronRight size={18} /></button>
            </div>
          </div>
          <div className="venue-calendar-week" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="venue-calendar-grid">
            {cells.map((cell) => {
              const hasPlan = plans.some((plan) => plan.startDate <= cell.date && plan.endDate >= cell.date);
              return (
                <button
                  key={cell.date}
                  type="button"
                  className={`${cell.currentMonth ? "" : "outside"} ${selectedDate === cell.date ? "selected" : ""} ${hasPlan ? "has-plan" : "empty"}`}
                  onClick={() => selectDate(cell.date)}
                  aria-label={`${cell.date}${hasPlan ? "，有灵感方案" : "，暂无灵感方案"}`}
                >
                  <span>{cell.day}</span>
                  {hasPlan ? <i aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
          <div className="venue-calendar-legend"><span><i className="ample" />已投放灵感方案</span></div>
        </section>

        <section className="venue-inspiration-panel" aria-label="灵感方案">
          <div className="venue-inspiration-topline">
            <div>{selectedDate ? <span>{formatDate(selectedDate)}</span> : null}</div>
          </div>

          {!selectedDate ? (
            <CreatorLogoWall creators={logoCreators} />
          ) : !hasLocation ? (
            <div className="venue-plan-loading">请先选择省市，查看对应城市的灵感方案</div>
          ) : plansLoading ? (
            <div className="venue-plan-loading">正在读取灵感方案</div>
          ) : selectedPlans.length ? (
            <div className="venue-plan-selector" aria-label="灵感方案列表">
              <span>灵感方案</span>
              <div>{selectedPlans.map((plan) => (
                <button type="button" key={plan.id} className={selectedPlan?.id === plan.id ? "selected" : ""} onClick={() => onSelectPlan(plan.id)} aria-pressed={selectedPlan?.id === plan.id}>
                  <small>{planDateLabel(plan)}</small><strong>{plan.title}</strong>
                </button>
              ))}</div>
            </div>
          ) : <div className="venue-plan-empty">更多灵感方案请联系TDE</div>}

          {selectedPlan ? (
            <>
              <div className="venue-inspiration-title">
                <Sparkles size={22} aria-hidden="true" />
                <div><span>灵感方案</span><h2>{`「${selectedPlan.title}」`}</h2></div>
              </div>
              <p className="venue-inspiration-summary">{selectedPlan.description}</p>
              <div className="venue-planning-export">
                <button type="button" onClick={() => void exportPlanningDeck()} disabled={exporting}>
                  {exporting ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}
                  {exporting ? "生成活动草案" : "下载活动草案 PPT"}
                </button>
                {exportError ? <small className="error">{exportError}</small> : null}
              </div>
            </>
          ) : null}
        </section>
      </div>
      {downloadInfo ? <DownloadLinkDialog open={true} onClose={() => setDownloadInfo(null)} pageUrl={downloadInfo.pageUrl} originalName={downloadInfo.originalName} size={downloadInfo.size} expiresAt={downloadInfo.expiresAt} /> : null}
    </section>
  );
}

export function VizStyleTagFilter({ tags, selectedTagLabels, onToggleTag }: { tags: PlanningTag[]; selectedTagLabels: string[]; onToggleTag: (label: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visibleTags = expanded ? tags : tags.slice(0, 10);
  return (
    <div className="venue-tag-row">
      <header>
        <span>风格倾向</span>
        {tags.length > 10 ? (
          <button type="button" className="venue-tag-toggle" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "收起" : `展开 ${tags.length}`}<ChevronDown size={14} className={expanded ? "expanded" : ""} />
          </button>
        ) : null}
      </header>
      <div>
        {visibleTags.length ? visibleTags.map((tag, index) => (
          <button key={tag.label} type="button" className={`tone-${index % 4} ${selectedTagLabels.includes(tag.label) ? "selected" : ""}`} onClick={() => onToggleTag(tag.label)} aria-pressed={selectedTagLabels.includes(tag.label)}>
            <Check className="tag-selection-mark" size={13} aria-hidden="true" />
            {tag.label}
          </button>
        )) : <small>当前范围暂无可用标签</small>}
      </div>
    </div>
  );
}
