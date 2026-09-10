import { absoluteAsset, ensureConsumerSession, request } from "../../utils/api";
import { defaultCreatorApplicationFields } from "../../utils/creator-application-fields";
import { creatorTagCategories, hydrateCreatorTagGroups, initialCreatorTagGroups } from "../../utils/creator-tags";
import { QIDENG_COLORS } from "../../utils/design-tokens";

const categories = creatorTagCategories;
const offlineTypes = ["DIY材料包", "个人工作室", "现场体验"];
const registerMediaKeys = [
  "qideng_register_image", "qideng_register_image_key", "qideng_register_image_url", "qideng_register_image_owner",
  "qideng_register_logo", "qideng_register_logo_key", "qideng_register_logo_url", "qideng_register_logo_owner",
];
function clearRegisterMedia() {
  registerMediaKeys.forEach((key) => wx.removeStorageSync(key));
}

function syncCustomTags(groups: any[], customTags: any[]) {
  return groups.map((group: any) => ({
    ...group,
    customTags: customTags.filter((tag: any) => tag.category === group.category),
  }));
}

Page({
  data: {
    designColors: QIDENG_COLORS,
    initializing: true,
    loadFailed: false,
    loading: false,
    creatorInvitationsEnabled: false,
    incomingInvite: "",
    focusCategory: "",
    focusIndex: -1,
    returnToProject: false,
    applicationFields: defaultCreatorApplicationFields,
    categories,
    tagGroups: initialCreatorTagGroups() as any[],
    customTags: [] as any[],
    offlineChoices: offlineTypes.map((label) => ({ label, selected: false })),
    region: [] as string[],
    busyDate: "",
    representativeImage: "",
    representativeImageKey: "",
    logoImage: "",
    logoImageKey: "",
    introCount: 0,
    consumerId: 0,
    existingApplication: false,
    applicationStatus: "none",
    reviewNote: "",
    form: {
      inviteCode: "", phone: "", confirmPhone: "", brandName: "", intro: "",
      province: "", city: "", district: "", tagIds: [] as number[],
      opportunityTypes: [] as string[], busyPeriods: [] as any[],
      noBookings: false,
      agreed: false,
    },
  },
  async onLoad(query: any) {
    let requestedFocus = String(query.focus || "");
    try { requestedFocus = decodeURIComponent(requestedFocus); } catch { requestedFocus = ""; }
    const focusIndex = categories.findIndex((category) => category === requestedFocus);
    this.setData({
      incomingInvite: query.invite ? String(query.invite).toUpperCase() : "",
      focusCategory: focusIndex >= 0 ? requestedFocus : "",
      focusIndex,
      returnToProject: String(query.returnTo || "") === "project",
    });
    await this.load();
  },
  async load() {
    this.setData({ initializing: true, loadFailed: false });
    try {
      await ensureConsumerSession();
      let tagData: any = { tags: [] };
      let applicationData: any = { application: null, consumerId: 0 };
      const [tagsLoaded, applicationLoaded] = await Promise.all([
        request<any>("/api/tags", { silent: true, cacheMs: 300000 }).then((value) => { tagData = value; return true; }).catch(() => false),
        request<any>("/api/mini/auth/creator-register", { silent: true }).then((value) => { applicationData = value; return true; }).catch(() => false),
      ]);
      if (!tagsLoaded || !applicationLoaded) throw new Error("申请资料暂时无法读取");
      const application = applicationData.application || null;
      const creatorInvitationsEnabled = applicationData.creatorInvitationsEnabled === true;
      const tags = (tagData.tags || []).filter((tag: any) => categories.includes(tag.category) && tag.status === "active");
      const selectedTagIds = application?.tagIds || [];
      const customTags = application?.customTags || [];
      const consumerId = Number(applicationData.consumerId || 0);
      const storedImageOwner = Number(wx.getStorageSync("qideng_register_image_owner") || 0);
      if (!consumerId || storedImageOwner !== consumerId) clearRegisterMedia();
      const storedImageKey = storedImageOwner === consumerId ? wx.getStorageSync("qideng_register_image_key") || "" : "";
      const storedImageUrl = storedImageOwner === consumerId ? wx.getStorageSync("qideng_register_image_url") || "" : "";
      const storedImage = storedImageOwner === consumerId ? wx.getStorageSync("qideng_register_image") || "" : "";
      const storedLogoOwner = Number(wx.getStorageSync("qideng_register_logo_owner") || 0);
      const storedLogoKey = storedLogoOwner === consumerId ? wx.getStorageSync("qideng_register_logo_key") || "" : "";
      const storedLogoUrl = storedLogoOwner === consumerId ? wx.getStorageSync("qideng_register_logo_url") || "" : "";
      const storedLogo = storedLogoOwner === consumerId ? wx.getStorageSync("qideng_register_logo") || "" : "";
      this.setData({
        initializing: false,
        loadFailed: false,
        consumerId,
        creatorInvitationsEnabled,
        applicationFields: applicationData.creatorApplicationFields || defaultCreatorApplicationFields,
        existingApplication: Boolean(application),
        applicationStatus: application?.status || "none",
        reviewNote: application?.reviewNote || "",
        customTags,
        representativeImageKey: storedImageKey || application?.representativeImageKey || "",
        representativeImage: storedImage || absoluteAsset(storedImageUrl || application?.representativeImageUrl),
        logoImageKey: storedLogoKey || application?.logoImageKey || "",
        logoImage: storedLogo || absoluteAsset(storedLogoUrl || application?.logoImageUrl),
        introCount: Array.from(String(application?.intro || "")).length,
        offlineChoices: offlineTypes.map((label) => ({ label, selected: (application?.opportunityTypes || []).includes(label) })),
        form: application ? {
          inviteCode: creatorInvitationsEnabled ? application.inviteCode : "",
          phone: application.phone,
          confirmPhone: application.phone,
          brandName: application.brandName,
          intro: application.intro || "",
          province: application.province,
          city: application.city,
          district: application.district,
          tagIds: selectedTagIds,
          opportunityTypes: (application.opportunityTypes || []).filter((value: string) => offlineTypes.includes(value)),
          busyPeriods: application.busyPeriods || [],
          noBookings: application.noBookings === true,
          agreed: true,
        } : { ...this.data.form, inviteCode: creatorInvitationsEnabled ? this.data.incomingInvite : "" },
        region: application ? [application.province, application.city, application.district].filter(Boolean) : [],
        tagGroups: syncCustomTags(hydrateCreatorTagGroups(tags, selectedTagIds), customTags),
      }, () => this.scrollToFocusedGroup());
    } catch {
      this.setData({ initializing: false, loadFailed: true, consumerId: 0 });
    }
  },
  retryLoad() { this.load(); },
  scrollToFocusedGroup() {
    if (this.data.focusIndex < 0) return;
    wx.nextTick(() => wx.pageScrollTo({ selector: `#creator-tag-${this.data.focusIndex}`, duration: 360 }));
  },
  onShow() {
    if (!this.data.consumerId) return;
    const storedImageOwner = Number(wx.getStorageSync("qideng_register_image_owner") || 0);
    if (storedImageOwner !== this.data.consumerId) {
      clearRegisterMedia();
      return;
    }
    const representativeImage = wx.getStorageSync("qideng_register_image") || "";
    const representativeImageKey = wx.getStorageSync("qideng_register_image_key") || "";
    const representativeImageUrl = wx.getStorageSync("qideng_register_image_url") || "";
    if (representativeImage || representativeImageKey)
      this.setData({ representativeImage: representativeImage || absoluteAsset(representativeImageUrl), representativeImageKey });
    const storedLogoOwner = Number(wx.getStorageSync("qideng_register_logo_owner") || 0);
    if (storedLogoOwner === this.data.consumerId) {
      const logoImage = wx.getStorageSync("qideng_register_logo") || "";
      const logoImageKey = wx.getStorageSync("qideng_register_logo_key") || "";
      const logoImageUrl = wx.getStorageSync("qideng_register_logo_url") || "";
      if (logoImage || logoImageKey) this.setData({ logoImage: logoImage || absoluteAsset(logoImageUrl), logoImageKey });
    }
  },
  field(event: any) {
    const key = event.currentTarget.dataset.key;
    const value = key === "inviteCode" ? String(event.detail.value || "").toUpperCase() : event.detail.value;
    this.setData({ [`form.${key}`]: value, ...(key === "intro" ? { introCount: Array.from(String(value || "")).length } : {}) });
  },
  agreement(event: any) { this.setData({ "form.agreed": event.detail.value.length > 0 }); },
  locationChange(event: any) {
    const region = (event.detail.value || []).map(String);
    if (region.length < 3) return;
    this.setData({
      region,
      "form.province": region[0],
      "form.city": region[1],
      "form.district": region[2],
    });
  },
  toggleGroup(event: any) {
    const category = event.currentTarget.dataset.category;
    this.setData({ tagGroups: this.data.tagGroups.map((group: any) => ({ ...group, open: group.category === category ? !group.open : group.open })) });
  },
  toggleTag(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    const category = event.currentTarget.dataset.category;
    if (!id) return wx.showToast({ title: "标签正在同步，请稍后重试", icon: "none" });
    const selected = [...this.data.form.tagIds];
    const exists = selected.includes(id);
    const selectedInCategory = this.data.tagGroups.find((group: any) => group.category === category)?.tags.filter((tag: any) => selected.includes(tag.id)).length || 0;
    const customInCategory = this.data.customTags.filter((tag: any) => tag.category === category).length;
    if (!exists && selectedInCategory + customInCategory >= 8) return wx.showToast({ title: "每类最多8个", icon: "none" });
    const next = exists ? selected.filter((item) => item !== id) : [...selected, id];
    this.setData({
      "form.tagIds": next,
      tagGroups: this.data.tagGroups.map((group: any) => ({ ...group, tags: group.tags.map((tag: any) => ({ ...tag, selected: next.includes(tag.id) })) })),
    });
  },
  toggleOffline(event: any) {
    const value = event.currentTarget.dataset.value;
    const selected = [...this.data.form.opportunityTypes];
    const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
    this.setData({ "form.opportunityTypes": next, offlineChoices: offlineTypes.map((label) => ({ label, selected: next.includes(label) })) });
  },
  customInput(event: any) {
    const category = event.currentTarget.dataset.category;
    this.setData({ tagGroups: this.data.tagGroups.map((group: any) => group.category === category ? { ...group, customLabel: event.detail.value } : group) });
  },
  addCustomTag(event: any) {
    const category = event.currentTarget.dataset.category;
    const group = this.data.tagGroups.find((item: any) => item.category === category);
    const label = String(group?.customLabel || "").trim();
    if (!label) return;
    if (Array.from(label).length > 7) return wx.showToast({ title: "最多7个字", icon: "none" });
    const total = (this.data.tagGroups.find((group: any) => group.category === category)?.tags.filter((tag: any) => this.data.form.tagIds.includes(tag.id)).length || 0)
      + this.data.customTags.filter((tag: any) => tag.category === category).length;
    if (total >= 8) return wx.showToast({ title: "每类最多8个", icon: "none" });
    if (this.data.customTags.some((tag: any) => tag.category === category && tag.label === label)) return;
    const customTags = [...this.data.customTags, { category, label }];
    const groups = this.data.tagGroups.map((item: any) => item.category === category ? { ...item, customLabel: "" } : item);
    this.setData({ customTags, tagGroups: syncCustomTags(groups, customTags) });
  },
  removeCustomTag(event: any) {
    const category = event.currentTarget.dataset.category;
    const label = event.currentTarget.dataset.label;
    const customTags = this.data.customTags.filter((tag: any) => tag.category !== category || tag.label !== label);
    this.setData({ customTags, tagGroups: syncCustomTags(this.data.tagGroups, customTags) });
  },
  busyDateChange(event: any) { this.setData({ busyDate: event.detail.value }); },
  addBusyDate() {
    const date = this.data.busyDate;
    if (!date || this.data.form.busyPeriods.some((item: any) => item.startDate === date)) return;
    const busyPeriods = [...this.data.form.busyPeriods, { startDate: date, endDate: date, note: "已有活动" }].sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
    this.setData({ "form.busyPeriods": busyPeriods, "form.noBookings": false, busyDate: "" });
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
  async chooseRegistrationImage(target: "representative" | "logo") {
    const result = await new Promise<any>((resolve, reject) => wx.chooseMedia({ count: 1, mediaType: ["image"], sourceType: ["album", "camera"], sizeType: ["original"], success: resolve, fail: reject }));
    const file = result.tempFiles?.[0];
    if (!file?.tempFilePath) return;
    if (Number(file.size || 0) > 20 * 1024 * 1024) return wx.showToast({ title: "图片不能超过20MB", icon: "none" });
    const info = await new Promise<any>((resolve, reject) => wx.getImageInfo({ src: file.tempFilePath, success: resolve, fail: reject }));
    const type = String(info.type || "").toLowerCase();
    if (["gif", "heic", "heif"].includes(type)) return wx.showToast({ title: "仅支持JPG、PNG、WebP", icon: "none" });
    if (Number(info.width || 0) * Number(info.height || 0) > 60_000_000) return wx.showToast({ title: "图片像素过大", icon: "none" });
    const minimumWidth = target === "logo" ? 800 : 1080;
    const minimumHeight = target === "logo" ? 800 : 1350;
    if (info.width < minimumWidth || info.height < minimumHeight) wx.showToast({ title: "图片较小，可能不够清晰", icon: "none" });
    wx.setStorageSync("qideng_crop_source", file.tempFilePath);
    wx.navigateTo({ url: `/pages/image-crop/image-crop?target=${target === "logo" ? "registerLogo" : "register"}` });
  },
  chooseImage() { return this.chooseRegistrationImage("representative"); },
  chooseLogo() { return this.chooseRegistrationImage("logo"); },
  openAgreement() { wx.navigateTo({ url: "/pages/legal/legal?type=agreement" }); },
  openPrivacy() { wx.navigateTo({ url: "/pages/legal/legal?type=privacy" }); },
  async submit() {
    if (this.data.loading) return;
    if (!this.data.consumerId) return wx.showToast({ title: "请先重新连接", icon: "none" });
    const form = this.data.form;
    if (!/^1\d{10}$/.test(form.phone)) return wx.showToast({ title: "请填写正确手机号", icon: "none" });
    if (form.phone !== form.confirmPhone) return wx.showToast({ title: "两次手机号不一致", icon: "none" });
    const fields = this.data.applicationFields;
    if (fields.brandName.required && !form.brandName.trim()) return wx.showToast({ title: `请填写${fields.brandName.label}`, icon: "none" });
    if (fields.intro.enabled && fields.intro.required && !form.intro.trim()) return wx.showToast({ title: `请填写${fields.intro.label}`, icon: "none" });
    if (fields.location.required && (!form.province || !form.city || !form.district)) return wx.showToast({ title: `请选择${fields.location.label}`, icon: "none" });
    if (fields.representativeImage.required && (!this.data.representativeImage || !this.data.representativeImageKey)) return wx.showToast({ title: `请上传${fields.representativeImage.label}`, icon: "none" });
    if (fields.tags.required && !form.tagIds.length && !this.data.customTags.length) return wx.showToast({ title: `请选择${fields.tags.label}`, icon: "none" });
    if (fields.offlineExperience.enabled && fields.offlineExperience.required && !form.opportunityTypes.length) return wx.showToast({ title: `请选择${fields.offlineExperience.label}`, icon: "none" });
    if (fields.busyPeriods.enabled && fields.busyPeriods.required && !form.noBookings && !form.busyPeriods.length)
      return wx.showToast({ title: "请选择活动日期或近期无其他活动", icon: "none" });
    this.setData({ loading: true });
    try {
      const data = await request<any>("/api/mini/auth/creator-register", { method: "POST", data: { ...form, customTags: this.data.customTags, representativeImageKey: this.data.representativeImageKey, logoImageKey: this.data.logoImageKey } });
      wx.setStorageSync("qideng_creator_token", data.session.token);
      clearRegisterMedia();
      wx.showToast({ title: "申请已提交", icon: "success" });
      setTimeout(() => {
        if (!this.data.returnToProject) {
          wx.redirectTo({ url: "/pages/creator-profile/creator-profile" });
          return;
        }
        wx.navigateBack({
          delta: 1,
          fail: () => wx.redirectTo({ url: "/pages/creator-project/creator-project" }),
        });
      }, 600);
    } finally {
      this.setData({ loading: false });
    }
  },
});
