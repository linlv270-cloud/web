import { absoluteAsset, ensureCreatorSession, request } from "../../utils/api";
import { defaultCreatorApplicationFields } from "../../utils/creator-application-fields";
import { creatorTagCategories, hydrateCreatorTagGroups, initialCreatorTagGroups } from "../../utils/creator-tags";
import { QIDENG_COLORS } from "../../utils/design-tokens";

const cooperationTypes = ["DIY材料包", "个人工作室", "现场体验"];

function preserveTagGroupState(groups: any[], previous: any[]) {
  return groups.map((group: any) => {
    const current = previous.find((item: any) => item.category === group.category);
    return { ...group, open: true, customLabel: current?.customLabel || "" };
  });
}

function withVersion(url: string, version: number) {
  if (!url || !version || !/^https?:\/\//.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
}

Page({
  data: {
    loading: true,
    designColors: QIDENG_COLORS,
    saving: false,
    contactSaving: false,
    datePlanSaving: false,
    home: null as any,
    tags: [] as any[],
    creatorCategories: creatorTagCategories,
    applicationFields: defaultCreatorApplicationFields,
    creatorTagGroups: initialCreatorTagGroups() as any[],
    cooperationChoices: cooperationTypes.map((label) => ({ label, selected: false })),
    form: {
      brandName: "",
      intro: "",
      province: "",
      city: "",
      district: "",
      creatorTagIds: [] as number[],
      opportunityTypes: [] as string[],
      busyPeriods: [] as any[],
      noBookings: false,
      phonePublicAuthorized: false,
    },
    imageUrl: "",
    busyDate: "",
    region: [] as string[],
  },
  async onShow() {
    try {
      await ensureCreatorSession();
      await this.load();
    } catch {
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  async load() {
    try {
      const homeData = await request<any>("/api/mini/creator/home", { actor: "creator", silent: true });
      let tagData: any = { tags: [] };
      let configData: any = { settings: null };
      const [tagsLoaded] = await Promise.all([
        request<any>("/api/tags?scope=all", { silent: true, cacheMs: 300000 }).then((value) => { tagData = value; return true; }).catch(() => false),
        request<any>("/api/mini/config", { silent: true, cacheMs: 300000 }).then((value) => { configData = value; return true; }).catch(() => false),
      ]);
      const home = homeData.home;
      const creator = home.creator;
      const tags = tagData.tags || [];
      const creatorTagIds = creator.tags
        .filter((tag: any) => creatorTagCategories.includes(tag.category))
        .map((tag: any) => tag.id);
      const imageVersion = Number(wx.getStorageSync("qideng_image_updated") || 0);
      const profileUpload = wx.getStorageSync("qideng_profile_image_result");
      const profileImage = profileUpload?.localPath || profileUpload?.url || creator.workUrls[0] || "";
      if (profileUpload?.localPath || profileUpload?.url) wx.removeStorageSync("qideng_profile_image_result");
      this.setData({
        home,
        tags,
        applicationFields: configData.settings?.creatorApplicationFields || defaultCreatorApplicationFields,
        creatorTagGroups: preserveTagGroupState(hydrateCreatorTagGroups(tags, creatorTagIds), this.data.creatorTagGroups),
        cooperationChoices: cooperationTypes.map((label) => ({ label, selected: (creator.opportunityTypes || []).includes(label) })),
        imageUrl: profileUpload?.localPath || withVersion(absoluteAsset(profileImage), Number(profileUpload?.updatedAt || imageVersion)),
        form: {
          brandName: creator.brandName,
          intro: creator.intro,
          province: creator.province,
          city: creator.city,
          district: creator.district,
          creatorTagIds,
          opportunityTypes: (creator.opportunityTypes || []).filter((value: string) => cooperationTypes.includes(value)),
          busyPeriods: creator.busyPeriods || [],
          noBookings: creator.noBookings === true,
          phonePublicAuthorized: home.phonePublicAuthorized === true,
        },
        region: [creator.province, creator.city, creator.district].filter(Boolean),
        loading: false,
      });
      if (!tagsLoaded) wx.showToast({ title: "标签加载失败，请稍后重试", icon: "none" });
    } catch {
      wx.removeStorageSync("qideng_creator_token");
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  field(event: any) {
    this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value });
  },
  phoneAgreement(event: any) {
    this.setData({ "form.phonePublicAuthorized": event.detail.value.length > 0 });
  },
  locationChange(event: any) {
    const region = (event.detail.value || []).map(String);
    if (region.length < 3) return;
    this.setData({ region, "form.province": region[0], "form.city": region[1], "form.district": region[2] });
  },
  toggleCreatorTag(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    if (!id) return wx.showToast({ title: "标签正在同步，请稍后重试", icon: "none" });
    const tag = this.data.tags.find((item: any) => item.id === id);
    const ids = [...this.data.form.creatorTagIds];
    const exists = ids.includes(id);
    if (!exists && this.data.tags.filter((item: any) => ids.includes(item.id) && item.category === tag.category).length >= 8)
      return wx.showToast({ title: `“${tag.category}”最多选择8个`, icon: "none" });
    const next = exists ? ids.filter((item) => item !== id) : [...ids, id];
    this.setData({
      "form.creatorTagIds": next,
      creatorTagGroups: this.data.creatorTagGroups.map((group: any) => ({
        ...group,
        tags: group.tags.map((item: any) => ({ ...item, selected: next.includes(item.id) })),
      })),
    });
  },
  toggleOpportunity(event: any) {
    const value = event.currentTarget.dataset.value;
    const selected = [...this.data.form.opportunityTypes];
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    this.setData({
      "form.opportunityTypes": next,
      cooperationChoices: cooperationTypes.map((label) => ({ label, selected: next.includes(label) })),
    });
  },
  customInput(event: any) {
    const category = event.currentTarget.dataset.category;
    this.setData({
      creatorTagGroups: this.data.creatorTagGroups.map((group: any) =>
        group.category === category ? { ...group, customLabel: event.detail.value } : group),
    });
  },
  busyDateChange(event: any) {
    this.setData({ busyDate: event.detail.value });
  },
  addBusyDate() {
    const date = this.data.busyDate;
    if (!date || this.data.form.busyPeriods.some((item: any) => item.startDate === date)) return;
    this.setData({
      busyDate: "",
      "form.busyPeriods": [...this.data.form.busyPeriods, { startDate: date, endDate: date, note: "已有活动" }]
        .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate)),
      "form.noBookings": false,
    });
  },
  removeBusyDate(event: any) {
    const index = Number(event.currentTarget.dataset.index);
    this.setData({ "form.busyPeriods": this.data.form.busyPeriods.filter((_: any, itemIndex: number) => itemIndex !== index) });
  },
  toggleNoBookings() {
    const noBookings = !this.data.form.noBookings;
    this.setData({
      "form.noBookings": noBookings,
      "form.busyPeriods": noBookings ? [] : this.data.form.busyPeriods,
      busyDate: "",
    });
  },
  editApplication() {
    wx.navigateTo({ url: "/pages/creator-register/creator-register" });
  },
  openNewProject() {
    wx.redirectTo({ url: "/pages/creator-project/creator-project?new=1" });
  },
  async saveDatePlan() {
    if (this.data.datePlanSaving) return;
    if (!this.data.form.noBookings && !this.data.form.busyPeriods.length)
      return wx.showToast({ title: "请选择活动日期或近期无其他活动", icon: "none" });
    this.setData({ datePlanSaving: true });
    try {
      await request("/api/mini/creator/dossier", {
        actor: "creator",
        method: "PATCH",
        data: { action: "schedule", busyPeriods: this.data.form.busyPeriods, noBookings: this.data.form.noBookings },
      });
      wx.showToast({ title: "日期计划已保存", icon: "success" });
      await this.load();
    } finally {
      this.setData({ datePlanSaving: false });
    }
  },
  async saveContactConsent() {
    if (this.data.contactSaving) return;
    this.setData({ contactSaving: true });
    try {
      const data = await request<any>("/api/mini/creator/dossier", {
        actor: "creator",
        method: "PATCH",
        data: { action: "contactConsent", authorized: this.data.form.phonePublicAuthorized },
      });
      this.setData({
        "home.phonePublicAuthorized": data.contact.phonePublicAuthorized,
        "home.phoneConsentAt": data.contact.phoneConsentAt,
        "home.contactPhoneMasked": data.contact.contactPhoneMasked,
      });
      wx.showToast({ title: data.contact.phonePublicAuthorized ? "手机号联系已开放" : "手机号联系已关闭", icon: "success" });
    } finally {
      this.setData({ contactSaving: false });
    }
  },
  async addCustomTag(event: any) {
    const category = event.currentTarget.dataset.category;
    const group = this.data.creatorTagGroups.find((item: any) => item.category === category);
    const customLabel = String(group?.customLabel || "").trim();
    if (!customLabel) return;
    await request<any>("/api/mini/creator/dossier", {
      actor: "creator",
      method: "PATCH",
      data: { action: "claimTag", customLabel, category },
    });
    this.setData({
      creatorTagGroups: this.data.creatorTagGroups.map((item: any) =>
        item.category === category ? { ...item, customLabel: "" } : item),
    });
    await this.load();
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
      wx.setStorageSync("qideng_crop_source", file.tempFilePath);
      wx.navigateTo({ url: "/pages/image-crop/image-crop?target=profile" });
    } catch {
      // Closing the media picker leaves the current image unchanged.
    }
  },
  async save() {
    if (this.data.saving) return;
    const fields = this.data.applicationFields;
    if (fields.brandName.required && !this.data.form.brandName.trim())
      return wx.showToast({ title: `请填写${fields.brandName.label}`, icon: "none" });
    if (fields.location.required && (!this.data.form.province || !this.data.form.city || !this.data.form.district))
      return wx.showToast({ title: `请选择${fields.location.label}`, icon: "none" });
    if (fields.representativeImage.required && !this.data.imageUrl)
      return wx.showToast({ title: `请上传${fields.representativeImage.label}`, icon: "none" });
    if (fields.intro.enabled && fields.intro.required && !this.data.form.intro.trim())
      return wx.showToast({ title: `请填写${fields.intro.label}`, icon: "none" });
    if (fields.tags.required && !this.data.form.creatorTagIds.length)
      return wx.showToast({ title: `请选择${fields.tags.label}`, icon: "none" });
    if (fields.offlineExperience.enabled && fields.offlineExperience.required && !this.data.form.opportunityTypes.length)
      return wx.showToast({ title: `请选择${fields.offlineExperience.label}`, icon: "none" });
    if (fields.busyPeriods.enabled && fields.busyPeriods.required && !this.data.form.noBookings && !this.data.form.busyPeriods.length)
      return wx.showToast({ title: "请选择活动日期或近期无其他活动", icon: "none" });
    this.setData({ saving: true });
    try {
      await request("/api/mini/creator/dossier", {
        actor: "creator",
        method: "PATCH",
        data: {
          action: "profile",
          brandName: this.data.form.brandName,
          intro: this.data.form.intro,
          province: this.data.form.province,
          city: this.data.form.city,
          district: this.data.form.district,
          opportunityTypes: this.data.form.opportunityTypes,
          opportunityOptIn: this.data.form.opportunityTypes.length > 0,
        },
      });
      await request("/api/mini/creator/dossier", {
        actor: "creator",
        method: "PATCH",
        data: { action: "replaceTags", tagIds: this.data.form.creatorTagIds },
      });
      await request("/api/mini/creator/dossier", {
        actor: "creator",
        method: "PATCH",
        data: { action: "schedule", busyPeriods: this.data.form.busyPeriods, noBookings: this.data.form.noBookings },
      });
      wx.showToast({ title: "新遇官资料已保存", icon: "success" });
      await this.load();
    } finally {
      this.setData({ saving: false });
    }
  },
});
