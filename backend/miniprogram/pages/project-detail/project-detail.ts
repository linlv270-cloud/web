import { absoluteAsset, ensureConsumerSession, guestId, request } from "../../utils/api";
import { hasFavorite, toggleFavorite } from "../../utils/favorites";

Page({
  data: {
    id: 0,
    detail: null as any,
    coverUrl: "",
    creatorImageUrl: "",
    creatorLogoUrl: "",
    creatorTags: [] as any[],
    opportunityText: "",
    contactOpen: false,
    revealingContact: false,
    contactPhone: "",
    maskedPhone: "",
    contactReminder: "联系时请说明：您好，我是通过奇灯小程序发现您的。",
    contactAvailable: false,
    contactLabel: "联系新遇官",
    favorited: false,
  },
  async onLoad(query: any) {
    const sceneMatch = /^p(\d+)$/.exec(decodeURIComponent(String(query.scene || "")));
    const id = Number(query.id || sceneMatch?.[1] || 0);
    this.setData({ id });
    try {
      const detail = await request<any>(`/api/mini/workshop/projects/${id}`, { silent: true, cacheMs: 120000 });
      const coverUrl = absoluteAsset(detail.project.coverUrl) || "/assets/companion-fallback.jpg";
      const contactAvailable = detail.phoneContact?.available === true && Boolean(detail.phoneContact?.maskedPhone);
      this.setData({
        detail,
        coverUrl,
        creatorImageUrl: absoluteAsset(detail.creatorPublic?.imageUrl),
        creatorLogoUrl: absoluteAsset(detail.creatorPublic?.logoUrl),
        creatorTags: (detail.creatorPublic?.tags || []).slice(0, 8),
        opportunityText: (detail.creatorPublic?.opportunityTypes || []).join(" · "),
        contactAvailable,
        maskedPhone: detail.phoneContact?.maskedPhone || "",
        contactLabel: contactAvailable ? "联系新遇官" : "暂未开放联系",
        favorited: hasFavorite(`project:${id}`),
      });
    } catch {
      wx.showModal({ title: "体验有变化", content: "这个体验暂时看不到了。", showCancel: false, success: () => wx.navigateBack() });
    }
  },
  back() { wx.navigateBack(); },
  coverError() { this.setData({ coverUrl: "/assets/companion-fallback.jpg" }); },
  creatorImageError() { this.setData({ creatorImageUrl: "" }); },
  creatorLogoError() { this.setData({ creatorLogoUrl: "" }); },
  closeContact() {
    if (this.data.revealingContact) return;
    this.setData({ contactOpen: false, contactPhone: "" });
  },
  keepContactOpen() {},
  consult() {
    if (!this.data.contactAvailable) return wx.showToast({ title: "该新遇官暂未开放联系", icon: "none" });
    this.setData({ contactOpen: true, contactPhone: "" });
  },
  async revealContact() {
    if (this.data.revealingContact || this.data.contactPhone) return;
    this.setData({ revealingContact: true });
    try {
      await ensureConsumerSession();
      const data = await request<any>("/api/mini/workshop/contact", {
        method: "POST",
        silent: true,
        data: { projectId: this.data.id, guestId: guestId() },
      });
      this.setData({
        contactPhone: data.phone || "",
        maskedPhone: data.maskedPhone || this.data.maskedPhone,
        contactReminder: data.reminder || this.data.contactReminder,
      });
    } catch (error: any) {
      wx.showToast({ title: error?.message || "联系方式暂时无法读取", icon: "none" });
    } finally {
      this.setData({ revealingContact: false });
    }
  },
  copyPhone() {
    if (!this.data.contactPhone) return;
    wx.setClipboardData({ data: this.data.contactPhone, success: () => wx.showToast({ title: "手机号已复制", icon: "none" }) });
  },
  callPhone() {
    if (!this.data.contactPhone) return;
    wx.makePhoneCall({ phoneNumber: this.data.contactPhone });
  },
  favorite() {
    const project = this.data.detail?.project;
    if (!project) return;
    const favorited = toggleFavorite({
      key: `project:${this.data.id}`, type: "project", id: this.data.id,
      title: project.oneLiner, imageUrl: this.data.coverUrl,
      subtitle: `${project.city} ${project.district}`.trim(), savedAt: Date.now(),
    });
    this.setData({ favorited });
    wx.showToast({ title: favorited ? "已收藏" : "已取消", icon: "none" });
  },
});
