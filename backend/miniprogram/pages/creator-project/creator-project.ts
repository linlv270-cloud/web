import { absoluteAsset, ensureCreatorSession, request, upload } from "../../utils/api";
import { QIDENG_COLORS } from "../../utils/design-tokens";

const projectCategories = ["我的作品", "我的客群", "我的风格", "现场体验", "项目场景"];
const projectCategoryMeta: Record<string, { label: string; emptyHint?: string; applicationCategory?: boolean }> = {
  "我的作品": { label: "体验品类", applicationCategory: true },
  "我的客群": { label: "适合人群", applicationCategory: true },
  "我的风格": { label: "体验风格", applicationCategory: true },
  "现场体验": { label: "体验形式", applicationCategory: true },
  "项目场景": { label: "使用场景", emptyHint: "暂时没有可用场景" },
};
const maxRetainedProjects = 20;
const projectDraftKey = "qideng_creator_project_draft";
const projectImageResultKey = "qideng_project_image_result";
const projectStatusLabels: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  published: "已发布",
  paused: "已暂停",
  rejected: "需修改",
};

function withVersion(url: string, version: number) {
  if (!url || !version || !/^https?:\/\//.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

function confirmAction(title: string, content: string, confirmText: string) {
  return new Promise<boolean>((resolve) => wx.showModal({
    title,
    content,
    confirmText,
    confirmColor: QIDENG_COLORS.ink,
    success: (result) => resolve(result.confirm),
    fail: () => resolve(false),
  }));
}

function activeOperationRequest(requests: any[], projectId: number, requestType: string) {
  return requests.find((item: any) =>
    Number(item.projectId) === projectId
    && item.requestType === requestType
    && ["pending", "approved"].includes(item.status),
  ) || null;
}

function applicationTagAction(applicationStatus: string, hasApprovedTags: boolean) {
  if (hasApprovedTags) return "调整申请标签";
  if (["needs_changes", "rejected"].includes(applicationStatus)) return "补充申请资料";
  return "请先在新遇官申请资料中选择";
}

function decorateProjectTagGroups(groups: any[], selectedIds: number[], openCategories = new Set<string>(), applicationStatus = "") {
  return groups.map((group: any) => {
    const tags = group.tags.map((tag: any) => ({ ...tag, selected: selectedIds.includes(Number(tag.id)) }));
    const selectedLabels = tags.filter((tag: any) => tag.selected).map((tag: any) => tag.label);
    const meta = projectCategoryMeta[group.category] || { label: group.category, emptyHint: "暂时没有可用标签" };
    return {
      ...group,
      ...meta,
      open: openCategories.has(group.category),
      tags,
      selectedCount: selectedLabels.length,
      selectedSummary: selectedLabels.length ? selectedLabels.slice(0, 3).join("、") + (selectedLabels.length > 3 ? ` 等${selectedLabels.length}个` : "") : "请选择",
      applicationActionLabel: meta.applicationCategory ? applicationTagAction(applicationStatus, tags.length > 0) : "",
    };
  });
}

Page({
  data: {
    loading: true,
    saving: false,
    actionProjectId: 0,
    editorOpen: false,
    createOnLoad: false,
    returningFromCrop: false,
    home: null as any,
    tags: [] as any[],
    projects: [] as any[],
    projectTagGroups: [] as any[],
    scheduleDate: "",
    operationRequests: [] as any[],
    firstLaunchRequest: null as any,
    limitedRequest: null as any,
    difficultyOptions: ["零基础友好", "需要一点经验", "进阶体验"],
    projectImageUrl: "",
    projectImageFallback: "",
    projectImageIsFallback: false,
    activeProjectCount: 0,
    maxRetainedProjects,
    projectRegion: [] as string[],
    form: {
      projectId: 0,
      projectTitle: "",
      oneLiner: "",
      description: "",
      province: "",
      city: "",
      district: "",
      availableDates: [] as string[],
      addressHint: "",
      minPeople: 1,
      maxPeople: 1,
      durationMinutes: 60,
      priceCents: 0,
      ageRange: "",
      difficulty: "easy",
      safetyNotes: "",
      selectedForDisplay: true,
      projectTagIds: [] as number[],
      requestFirstLaunch: false,
      firstLaunchReason: "",
      firstLaunchAcknowledged: false,
      requestLimited: false,
      limitedReason: "",
      limitedAcknowledged: false,
    },
  },
  onLoad(query: any) {
    this.setData({ createOnLoad: String(query.new || "") === "1" });
  },
  async onShow() {
    if (this.data.returningFromCrop) {
      this.setData({ returningFromCrop: false });
      this.consumeProjectImageResult();
      return;
    }
    try {
      await ensureCreatorSession();
      await this.load();
    } catch {
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  async load() {
    try {
      const [homeData, tagData] = await Promise.all([
        request<any>("/api/mini/creator/home", { actor: "creator", silent: true }),
        request<any>("/api/tags?scope=all", { silent: true, cacheMs: 300000 }),
      ]);
      const home = homeData.home;
      const retainedProjects = home.projects.filter((item: any) => item.status !== "archived");
      const uploadResult = wx.getStorageSync(projectImageResultKey);
      const storedDraft = wx.getStorageSync(projectDraftKey);
      const draftForm = storedDraft?.form || null;
      const imageVersion = Number(wx.getStorageSync("qideng_image_updated") || 0);
      const preferredProjectId = Number(draftForm?.projectId || uploadResult?.projectId || wx.getStorageSync("qideng_creator_project_id") || this.data.form.projectId || 0);
      const project = preferredProjectId
        ? retainedProjects.find((item: any) => item.id === preferredProjectId) || null
        : draftForm ? null : retainedProjects.find((item: any) => item.selectedForDisplay)
          || retainedProjects[0]
          || null;
      const restoredDraft = draftForm && Number(draftForm.projectId || 0) === Number(project?.id || 0) ? draftForm : null;
      const fallbackProject = project
        || retainedProjects.find((item: any) => item.selectedForDisplay)
        || retainedProjects[0]
        || null;
      const sourceProject = restoredDraft ? project : fallbackProject;
      const operationDraft = sourceProject?.operationDraft || {};
      const tags = tagData.tags || [];
      const ownedTagIds = new Set((home.approvedProjectTagIds || []).map(Number));
      const projectTagIds = restoredDraft?.projectTagIds || sourceProject?.tags
        ?.filter((tag: any) => projectCategories.includes(tag.category))
        .map((tag: any) => tag.id) || [];
      const availableDates = restoredDraft?.availableDates
        || sourceProject?.schedules?.filter((item: any) => item.status === "open").map((item: any) => item.availableDate)
        || [];
      const location = {
        province: restoredDraft?.province || sourceProject?.province || home.creator.province,
        city: restoredDraft?.city || sourceProject?.city || home.creator.city,
        district: restoredDraft?.district || sourceProject?.district || home.creator.district,
      };
      const editedProjectId = Number(restoredDraft?.projectId || sourceProject?.id || 0);
      const operationRequests = home.operationRequests || [];
      const uploadMatchesEditor = Boolean(uploadResult) && Number(uploadResult?.projectId || 0) === editedProjectId;
      const uploadedLocalPath = uploadMatchesEditor ? String(uploadResult.localPath || "") : "";
      const uploadedRemoteUrl = uploadMatchesEditor ? String(uploadResult.url || "") : "";
      const persistentProjectImage = withVersion(
        absoluteAsset(uploadedRemoteUrl || sourceProject?.coverUrl),
        Number(uploadResult?.updatedAt || imageVersion),
      );
      const projectImageUrl = uploadedLocalPath || persistentProjectImage;
      const projectImageFallback = uploadedLocalPath && persistentProjectImage ? persistentProjectImage : "";
      const projectImageIsFallback = Boolean(projectImageUrl)
        && !uploadedLocalPath
        && !uploadedRemoteUrl
        && sourceProject?.coverSource === "representative";
      const projects = retainedProjects.map((item: any) => {
        const isUploadedProject = Boolean(uploadResult) && Number(uploadResult?.projectId || 0) === item.id;
        const localPath = isUploadedProject ? String(uploadResult?.localPath || "") : "";
        const persistentUrl = withVersion(
          absoluteAsset(isUploadedProject ? uploadResult?.url || item.coverUrl : item.coverUrl),
          Number(isUploadedProject ? uploadResult?.updatedAt || imageVersion : imageVersion),
        );
        return {
          ...item,
          displayTitle: item.title || item.oneLiner || `体验 ${item.id}`,
          statusLabel: projectStatusLabels[item.status] || item.status,
          imageUrl: localPath || persistentUrl,
          imageFallback: localPath && persistentUrl ? persistentUrl : "",
          imageIsFallback: !localPath && !isUploadedProject && item.coverSource === "representative",
        };
      });
      const openCategories = new Set<string>(this.data.projectTagGroups.filter((group: any) => group.open).map((group: any) => group.category));
      const projectTagGroups = decorateProjectTagGroups(projectCategories.map((category) => ({
        category,
        tags: tags
          .filter((tag: any) => tag.category === category && tag.status === "active")
          .filter((tag: any) => category === "项目场景" || ownedTagIds.has(Number(tag.id)))
          .map((tag: any) => ({ ...tag })),
      })), projectTagIds, openCategories, home.applicationStatus);
      const editorOpen = Boolean(this.data.editorOpen || restoredDraft || uploadResult);
      const createOnLoad = this.data.createOnLoad;
      if (editedProjectId && editorOpen) wx.setStorageSync("qideng_creator_project_id", editedProjectId);
      this.setData({
        home,
        tags,
        projects,
        editorOpen,
        createOnLoad: false,
        projectImageUrl,
        projectImageFallback,
        projectImageIsFallback,
        operationRequests,
        firstLaunchRequest: activeOperationRequest(operationRequests, editedProjectId, "first_launch"),
        limitedRequest: activeOperationRequest(operationRequests, editedProjectId, "limited"),
        activeProjectCount: retainedProjects.length,
        projectRegion: [location.province, location.city, location.district].filter(Boolean),
        projectTagGroups,
        scheduleDate: String(storedDraft?.scheduleDate || ""),
        form: {
          projectId: restoredDraft?.projectId || sourceProject?.id || 0,
          projectTitle: restoredDraft?.projectTitle ?? sourceProject?.title ?? "",
          oneLiner: restoredDraft?.oneLiner ?? sourceProject?.oneLiner ?? "",
          description: restoredDraft?.description ?? sourceProject?.description ?? "",
          province: location.province,
          city: location.city,
          district: location.district,
          availableDates,
          addressHint: restoredDraft?.addressHint ?? sourceProject?.addressHint ?? "",
          minPeople: restoredDraft?.minPeople ?? sourceProject?.minPeople ?? 1,
          maxPeople: restoredDraft?.maxPeople ?? sourceProject?.maxPeople ?? sourceProject?.minPeople ?? 1,
          durationMinutes: restoredDraft?.durationMinutes ?? sourceProject?.durationMinutes ?? 60,
          priceCents: restoredDraft?.priceCents ?? sourceProject?.priceCents ?? 0,
          ageRange: restoredDraft?.ageRange ?? sourceProject?.ageRange ?? "",
          difficulty: restoredDraft?.difficulty ?? sourceProject?.difficulty ?? "easy",
          safetyNotes: restoredDraft?.safetyNotes ?? sourceProject?.safetyNotes ?? "",
          selectedForDisplay: restoredDraft?.selectedForDisplay ?? (sourceProject ? sourceProject.selectedForDisplay === true : retainedProjects.length === 0),
          projectTagIds,
          requestFirstLaunch: restoredDraft?.requestFirstLaunch ?? operationDraft.requestFirstLaunch ?? false,
          firstLaunchReason: restoredDraft?.firstLaunchReason ?? operationDraft.firstLaunchReason ?? "",
          firstLaunchAcknowledged: restoredDraft?.firstLaunchAcknowledged ?? operationDraft.firstLaunchAcknowledged ?? false,
          requestLimited: restoredDraft?.requestLimited ?? operationDraft.requestLimited ?? false,
          limitedReason: restoredDraft?.limitedReason ?? operationDraft.limitedReason ?? "",
          limitedAcknowledged: restoredDraft?.limitedAcknowledged ?? operationDraft.limitedAcknowledged ?? false,
        },
        loading: false,
      }, () => {
        if (createOnLoad) this.newProject();
        else if (editorOpen) this.scrollToEditor();
      });
    } catch {
      wx.removeStorageSync("qideng_creator_token");
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  field(event: any) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },
  locationChange(event: any) {
    const [province = "", city = "", district = ""] = event.detail.value || [];
    this.setData({
      projectRegion: [province, city, district],
      "form.province": province,
      "form.city": city,
      "form.district": district,
    });
  },
  difficultyChange(event: any) {
    const values = ["easy", "medium", "hard"];
    this.setData({ "form.difficulty": values[Number(event.detail.value || 0)] || "easy" });
  },
  scheduleDateChange(event: any) { this.setData({ scheduleDate: String(event.detail.value || "") }); },
  addAvailableDate() {
    const date = this.data.scheduleDate;
    if (!date) return wx.showToast({ title: "请先选择日期", icon: "none" });
    const dates = [...new Set([...this.data.form.availableDates, date])].sort();
    this.setData({ "form.availableDates": dates, scheduleDate: "" });
  },
  removeAvailableDate(event: any) {
    const date = String(event.currentTarget.dataset.date || "");
    this.setData({ "form.availableDates": this.data.form.availableDates.filter((item: string) => item !== date) });
  },
  scrollToEditor() {
    wx.nextTick(() => wx.pageScrollTo({ selector: "#project-editor", duration: 260 }));
  },
  editProject(event: any) {
    const projectId = Number(event.currentTarget.dataset.id || 0);
    if (!projectId) return;
    wx.removeStorageSync(projectDraftKey);
    wx.removeStorageSync(projectImageResultKey);
    wx.setStorageSync("qideng_creator_project_id", projectId);
    this.setData({ editorOpen: true }, () => this.load());
  },
  closeEditor() {
    this.setData({ editorOpen: false });
    wx.removeStorageSync("qideng_creator_project_id");
    wx.removeStorageSync(projectDraftKey);
    wx.removeStorageSync(projectImageResultKey);
  },
  newProject() {
    if (this.data.activeProjectCount >= maxRetainedProjects)
      return wx.showToast({ title: `最多保留${maxRetainedProjects}个项目`, icon: "none" });
    wx.removeStorageSync("qideng_creator_project_id");
    wx.removeStorageSync(projectDraftKey);
    wx.removeStorageSync(projectImageResultKey);
    const creator = this.data.home?.creator || {};
    const representativeImageUrl = absoluteAsset(creator.workUrls?.[0] || "");
    this.setData({
      editorOpen: true,
      projectRegion: [creator.province, creator.city, creator.district].filter(Boolean),
      projectImageUrl: representativeImageUrl,
      projectImageFallback: "",
      projectImageIsFallback: Boolean(representativeImageUrl),
      form: {
        projectId: 0,
        projectTitle: "",
        oneLiner: "",
        description: "",
        province: creator.province || "",
        city: creator.city || "",
        district: creator.district || "",
        availableDates: [],
        addressHint: "",
        minPeople: 1,
        maxPeople: 1,
        durationMinutes: 60,
        priceCents: 0,
        ageRange: "",
        difficulty: "easy",
        safetyNotes: "",
        selectedForDisplay: this.data.activeProjectCount === 0,
        projectTagIds: [],
        requestFirstLaunch: false,
        firstLaunchReason: "",
        firstLaunchAcknowledged: false,
        requestLimited: false,
        limitedReason: "",
        limitedAcknowledged: false,
      },
      firstLaunchRequest: null,
      limitedRequest: null,
      projectTagGroups: decorateProjectTagGroups(this.data.projectTagGroups.map((group: any) => ({
        ...group,
        tags: group.tags.map((tag: any) => ({ ...tag })),
      })), [], new Set<string>(), this.data.home?.applicationStatus),
    }, () => this.scrollToEditor());
  },
  async setDisplayProject(event: any) {
    const projectId = Number(event.currentTarget.dataset.id || 0);
    const project = this.data.projects.find((item: any) => item.id === projectId);
    if (!project || project.selectedForDisplay || this.data.actionProjectId) return;
    const confirmed = await confirmAction("设为前台展示", `确认将“${project.displayTitle}”设为唯一展示体验？`, "确认展示");
    if (!confirmed) return;
    this.setData({ actionProjectId: projectId });
    try {
      await request<any>("/api/mini/creator/project", {
        actor: "creator",
        method: "POST",
        data: { id: projectId, selectedForDisplay: true },
      });
      wx.showToast({ title: "已设为展示", icon: "success" });
      await this.load();
    } finally {
      this.setData({ actionProjectId: 0 });
    }
  },
  async deleteProject(event: any) {
    const projectId = Number(event.currentTarget.dataset.id || 0);
    const project = this.data.projects.find((item: any) => item.id === projectId);
    if (!project || this.data.actionProjectId) return;
    const content = project.selectedForDisplay
      ? `“${project.displayTitle}”正在前台展示。删除后前台将暂不展示项目，确认删除？`
      : `确认删除“${project.displayTitle}”？删除后不再出现在历史体验中。`;
    const confirmed = await confirmAction("删除体验", content, "确认删除");
    if (!confirmed) return;
    this.setData({ actionProjectId: projectId });
    try {
      await request<any>("/api/mini/creator/project", {
        actor: "creator",
        method: "POST",
        data: { id: projectId, status: "archived" },
      });
      if (this.data.form.projectId === projectId) {
        wx.removeStorageSync("qideng_creator_project_id");
        this.setData({ editorOpen: false });
      }
      wx.showToast({ title: "体验已删除", icon: "success" });
      await this.load();
    } finally {
      this.setData({ actionProjectId: 0 });
    }
  },
  previewHistoryImage(event: any) {
    const url = String(event.currentTarget.dataset.url || "");
    this.openImagePreview(url);
  },
  projectImageError(event: any) {
    const projectId = Number(event.currentTarget.dataset.id || 0);
    const projects = this.data.projects.map((item: any) => item.id === projectId
      ? { ...item, imageUrl: item.imageFallback || "", imageFallback: "", imageIsFallback: false }
      : item);
    const updates: Record<string, unknown> = { projects };
    if (projectId === Number(this.data.form.projectId || 0)) {
      updates.projectImageUrl = this.data.projectImageFallback || "";
      updates.projectImageFallback = "";
      updates.projectImageIsFallback = false;
    }
    this.setData(updates);
  },
  openImagePreview(url: string) {
    if (!url) return wx.showToast({ title: "该体验还没有图片", icon: "none" });
    wx.previewImage({ current: url, urls: [url], fail: () => wx.showToast({ title: "图片暂时无法读取，请重新上传", icon: "none" }) });
  },
  consumeProjectImageResult() {
    const result = wx.getStorageSync(projectImageResultKey);
    if (!result || Number(result.projectId || 0) !== Number(this.data.form.projectId || 0)) return;
    const localPath = String(result.localPath || "");
    const remoteUrl = withVersion(absoluteAsset(String(result.url || "")), Number(result.updatedAt || Date.now()));
    const imageUrl = localPath || remoteUrl;
    const imageFallback = localPath && remoteUrl ? remoteUrl : "";
    const projectId = Number(this.data.form.projectId || 0);
    this.setData({
      projectImageUrl: imageUrl,
      projectImageFallback: imageFallback,
      projectImageIsFallback: false,
      projects: this.data.projects.map((item: any) => item.id === projectId
        ? { ...item, imageUrl, imageFallback, imageIsFallback: false }
        : item),
    });
  },
  toggleProjectTagGroup(event: any) {
    const category = String(event.currentTarget.dataset.category || "");
    this.setData({
      projectTagGroups: this.data.projectTagGroups.map((group: any) =>
        group.category === category ? { ...group, open: !group.open } : group),
    });
  },
  toggleProjectTag(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    const ids = [...this.data.form.projectTagIds];
    const next = ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
    const openCategories = new Set<string>(this.data.projectTagGroups.filter((group: any) => group.open).map((group: any) => group.category));
    const nextGroups = decorateProjectTagGroups(this.data.projectTagGroups, next, openCategories, this.data.home?.applicationStatus);
    this.setData({
      "form.projectTagIds": next,
      projectTagGroups: nextGroups,
    });
  },
  openApplicationTagGroup(event: any) {
    const category = String(event.currentTarget.dataset.category || "");
    if (!projectCategoryMeta[category]?.applicationCategory) return;
    wx.setStorageSync(projectDraftKey, {
      form: this.data.form,
      scheduleDate: this.data.scheduleDate,
      savedAt: Date.now(),
    });
    wx.navigateTo({
      url: `/pages/creator-register/creator-register?focus=${encodeURIComponent(category)}&returnTo=project`,
    });
  },
  toggleOperation(event: any) {
    const key = String(event.currentTarget.dataset.key || "");
    this.setData({ [`form.${key}`]: !(this.data.form as any)[key] });
  },
  operationStatus(projectId: number, requestType: string) {
    return activeOperationRequest(this.data.operationRequests, projectId, requestType);
  },
  validationMessage(includeOperationRules: boolean) {
    const form = this.data.form;
    if (!String(form.projectTitle || "").trim()) return "请填写体验名称";
    if (!String(form.oneLiner || "").trim()) return "请填写顾客在卡片上看到的一句话体验";
    if (!form.city) return "请选择体验城市";
    if (!form.availableDates.length) return "请至少添加一个可体验日期";
    if (Number(form.maxPeople) < Number(form.minPeople)) return "最多人数不能少于最少人数";
    const worksGroup = this.data.projectTagGroups.find((group: any) => group.category === "我的作品");
    if (!worksGroup?.tags.some((tag: any) => form.projectTagIds.includes(tag.id))) return "请至少选择一个体验品类";
    const sceneGroup = this.data.projectTagGroups.find((group: any) => group.category === "项目场景");
    if (!sceneGroup?.tags.some((tag: any) => form.projectTagIds.includes(tag.id))) return "请至少选择一个使用场景";
    if (includeOperationRules && form.requestFirstLaunch && !form.firstLaunchAcknowledged) return "请先确认首发尝鲜申请规则";
    if (includeOperationRules && form.requestFirstLaunch && String(form.firstLaunchReason || "").trim().length < 8) return "首发尝鲜申请理由请至少填写8个字";
    if (includeOperationRules && form.requestLimited && !form.limitedAcknowledged) return "请先确认限时限量申请规则";
    if (includeOperationRules && form.requestLimited && String(form.limitedReason || "").trim().length < 8) return "限时限量申请理由请至少填写8个字";
    return "";
  },
  async saveProject() {
    const dates = [...this.data.form.availableDates].sort();
    const data = await request<any>("/api/mini/creator/project", {
      actor: "creator",
      method: "POST",
      data: {
        id: this.data.form.projectId || undefined,
        title: this.data.form.projectTitle || this.data.home?.creator?.brandName,
        oneLiner: this.data.form.oneLiner,
        description: this.data.form.description,
        province: this.data.form.province,
        city: this.data.form.city,
        district: this.data.form.district,
        addressHint: this.data.form.addressHint,
        startDate: dates[0],
        endDate: dates[dates.length - 1],
        schedules: dates.map((availableDate: string) => ({ availableDate })),
        minPeople: this.data.form.minPeople,
        maxPeople: this.data.form.maxPeople,
        durationMinutes: this.data.form.durationMinutes,
        priceCents: this.data.form.priceCents,
        ageRange: this.data.form.ageRange,
        difficulty: this.data.form.difficulty,
        safetyNotes: this.data.form.safetyNotes,
        noPlan: false,
        selectedForDisplay: this.data.form.selectedForDisplay,
        tagIds: this.data.form.projectTagIds,
        operationDraft: {
          requestFirstLaunch: this.data.form.requestFirstLaunch,
          firstLaunchReason: this.data.form.firstLaunchReason,
          firstLaunchAcknowledged: this.data.form.firstLaunchAcknowledged,
          requestLimited: this.data.form.requestLimited,
          limitedReason: this.data.form.limitedReason,
          limitedAcknowledged: this.data.form.limitedAcknowledged,
        },
      },
    });
    this.setData({ "form.projectId": data.project.id });
    wx.setStorageSync("qideng_creator_project_id", data.project.id);
    return data.project;
  },
  async submitOperationRequests(projectId: number) {
    const form = this.data.form;
    if (form.requestFirstLaunch && !this.operationStatus(projectId, "first_launch")) {
      await request("/api/mini/creator/project-operation", {
        actor: "creator",
        method: "POST",
        data: {
          projectId,
          requestType: "first_launch",
          ruleAcknowledged: form.firstLaunchAcknowledged,
          reason: form.firstLaunchReason,
        },
      });
    }
    if (form.requestLimited && !this.operationStatus(projectId, "limited")) {
      await request("/api/mini/creator/project-operation", {
        actor: "creator",
        method: "POST",
        data: {
          projectId,
          requestType: "limited",
          ruleAcknowledged: form.limitedAcknowledged,
          reason: form.limitedReason,
        },
      });
    }
  },
  async persistPendingProjectImage(projectId: number) {
    const pending = wx.getStorageSync(projectImageResultKey);
    if (!pending?.localPath) return;
    const pendingProjectId = Number(pending.projectId || 0);
    if (pendingProjectId !== 0 && pendingProjectId !== projectId) return;
    if (pendingProjectId === projectId && pending.url) return;
    const uploading = { ...pending, projectId };
    wx.setStorageSync(projectImageResultKey, uploading);
    const uploaded = await upload<any>("/api/mini/creator/project-image", pending.localPath, { projectId: String(projectId) });
    const saved = { ...uploading, url: uploaded.url || "", updatedAt: Date.now() };
    wx.setStorageSync(projectImageResultKey, saved);
    this.setData({
      projectImageUrl: saved.localPath || absoluteAsset(saved.url),
      projectImageFallback: saved.localPath && saved.url ? absoluteAsset(saved.url) : "",
      projectImageIsFallback: false,
    });
  },
  async chooseImage() {
    try {
      const result = await new Promise<any>((resolve, reject) => wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        sizeType: ["original"],
        success: resolve,
        fail: reject,
      }));
      const file = result.tempFiles?.[0];
      if (!file?.tempFilePath) return;
      if (Number(file.size || 0) > 20 * 1024 * 1024)
        return wx.showToast({ title: "图片不能超过20MB", icon: "none" });
      const info = await new Promise<any>((resolve, reject) => wx.getImageInfo({ src: file.tempFilePath, success: resolve, fail: reject }));
      const type = String(info.type || "").toLowerCase();
      if (["gif", "heic", "heif"].includes(type))
        return wx.showToast({ title: "仅支持JPG、PNG、WebP", icon: "none" });
      if (Number(info.width || 0) * Number(info.height || 0) > 60_000_000)
        return wx.showToast({ title: "图片像素过大", icon: "none" });
      wx.setStorageSync(projectDraftKey, { form: this.data.form, scheduleDate: this.data.scheduleDate, savedAt: Date.now() });
      wx.setStorageSync("qideng_crop_source", file.tempFilePath);
      this.setData({ returningFromCrop: true });
      wx.navigateTo({ url: `/pages/image-crop/image-crop?target=project&projectId=${this.data.form.projectId}` });
    } catch {
      // Closing the media picker leaves the project unchanged.
    }
  },
  previewProjectImage() {
    this.openImagePreview(this.data.projectImageUrl);
  },
  preview() {
    const selectedTags = this.data.projectTagGroups.flatMap((group: any) =>
      group.tags.filter((tag: any) => this.data.form.projectTagIds.includes(tag.id)).map((tag: any) => tag.label));
    wx.setStorageSync("qideng_creator_project_preview", {
      ...this.data.form,
      imageUrl: this.data.projectImageUrl || "/assets/companion-fallback.jpg",
      creatorName: this.data.home?.creator?.brandName || "奇灯新遇官",
      tags: selectedTags,
    });
    wx.navigateTo({ url: "/pages/creator-project-preview/creator-project-preview" });
  },
  async save() {
    if (this.data.saving) return;
    const submitForReview = ["active", "legacy"].includes(this.data.home?.applicationStatus);
    const validation = this.validationMessage(submitForReview);
    if (validation) return wx.showToast({ title: validation, icon: "none" });
    this.setData({ saving: true });
    try {
      const project = await this.saveProject();
      await this.persistPendingProjectImage(project.id);
      if (submitForReview) await this.submitOperationRequests(project.id);
      wx.showToast({
        title: submitForReview ? "已提交审核" : "草稿已保存",
        icon: "success",
      });
      this.setData({ editorOpen: false });
      wx.removeStorageSync("qideng_creator_project_id");
      wx.removeStorageSync(projectDraftKey);
      wx.removeStorageSync(projectImageResultKey);
      await this.load();
    } finally {
      this.setData({ saving: false });
    }
  },
});
