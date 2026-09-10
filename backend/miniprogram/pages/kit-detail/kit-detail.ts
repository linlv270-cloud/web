import { absoluteAsset, request } from "../../utils/api";
import { hasFavorite, toggleFavorite } from "../../utils/favorites";

Page({
  data: { id: 0, venueId: 0, detail: null as any, coverUrl: "", favorited: false, contactCopy: "联系官方微信、联系官方小红书" },
  async onLoad(query: any) {
    const scene = decodeURIComponent(String(query.scene || ""));
    const sceneMatch = /^k(\d+)(?:v(\d+))?$/.exec(scene);
    const id = Number(query.id || sceneMatch?.[1] || 0);
    const venueId = Number(query.venueId || sceneMatch?.[2] || 0);
    this.setData({ id, venueId });
    try {
      const suffix = venueId ? `?venueId=${venueId}` : "";
      const [detail, config] = await Promise.all([
        request<any>(`/api/mini/workshop/kits/${id}${suffix}`, { silent: true, cacheMs: 120000 }),
        request<any>("/api/mini/config", { silent: true, cacheMs: 300000 }).catch(() => ({ settings: null })),
      ]);
      const coverUrl = absoluteAsset(detail.kit.coverUrl) || "/assets/self-play-fallback.jpg";
      this.setData({ detail, coverUrl, contactCopy: config.settings?.contactCopy || this.data.contactCopy, favorited: hasFavorite(`kit:${id}:${venueId || 0}`) });
    } catch {
      wx.showModal({ title: "材料包有变化", content: "这个材料包暂时看不到了。", showCancel: false, success: () => wx.navigateBack() });
    }
  },
  back() { wx.navigateBack(); },
  favorite() {
    const kit = this.data.detail?.kit;
    if (!kit) return;
    const favorited = toggleFavorite({
      key: `kit:${this.data.id}:${this.data.venueId || 0}`,
      type: "kit", id: this.data.id, venueId: this.data.venueId || 0,
      title: kit.title, imageUrl: this.data.coverUrl,
      subtitle: this.data.detail?.selectedVenueKit?.venue?.businessArea || "自在",
      savedAt: Date.now(),
    });
    this.setData({ favorited });
    wx.showToast({ title: favorited ? "已收藏" : "已取消", icon: "none" });
  },
  contact() {
    wx.showModal({ title: "联系奇灯", content: this.data.contactCopy, showCancel: false, confirmText: "知道了" });
  },
  openGuideLink(event: any) {
    const link = event.currentTarget.dataset.link || "";
    if (link) wx.setClipboardData({ data: link, success: () => wx.showToast({ title: "教程链接已复制", icon: "none" }) });
  },
});
