import { ensureConsumerSession, enterCreatorMode, request } from "../../utils/api";
import { listDiscoveries } from "../../utils/discoveries";
import { listFavorites, removeFavorite } from "../../utils/favorites";

Page({
    data: { loading: true, consumer: null as any, roles: null as any, discoveries: [] as any[], favorites: [] as any[], contactCopy: "联系官方微信、联系官方小红书" },
  async onShow() {
    try {
      await ensureConsumerSession();
      const [me, config] = await Promise.all([
        request<any>("/api/mini/me"),
        request<any>("/api/mini/config", { silent: true, cacheMs: 300000 }).catch(() => ({ settings: null })),
      ]);
      this.setData({ consumer: me.consumer, roles: me.roles, discoveries: listDiscoveries(), favorites: listFavorites(), contactCopy: config.settings?.contactCopy || this.data.contactCopy, loading: false });
    } catch { this.setData({ loading: false }); }
  },
  back() { wx.navigateBack(); },
  openDiscovery(event: any) {
    const item = this.data.discoveries.find((discovery: any) => discovery.key === event.currentTarget.dataset.key);
    if (!item) return;
    const url = item.type === "project"
      ? `/pages/project-detail/project-detail?id=${item.id}`
      : `/pages/kit-detail/kit-detail?id=${item.id}&venueId=${item.venueId || 0}`;
    wx.navigateTo({ url });
  },
  openFavorite(event: any) {
    const item = this.data.favorites.find((favorite: any) => favorite.key === event.currentTarget.dataset.key);
    if (!item) return;
    const url = item.type === "project"
      ? `/pages/project-detail/project-detail?id=${item.id}`
      : `/pages/kit-detail/kit-detail?id=${item.id}&venueId=${item.venueId || 0}`;
    wx.navigateTo({ url });
  },
  removeFavorite(event: any) {
    removeFavorite(event.currentTarget.dataset.key);
    this.setData({ favorites: listFavorites() });
  },
  contact() { wx.showModal({ title: "联系奇灯", content: this.data.contactCopy, showCancel: false, confirmText: "知道了" }); },
  home() { wx.reLaunch({ url: "/pages/index/index" }); },
  async creatorMode() {
    if (!this.data.roles?.creatorId) return wx.navigateTo({ url: "/pages/creator-register/creator-register" });
    const result = await enterCreatorMode();
    wx.navigateTo({ url: "/pages/creator-profile/creator-profile" });
    if (result.status === "pending") wx.showToast({ title: "申请审核中，可继续完善资料", icon: "none" });
  },
  claimCreator() { wx.navigateTo({ url: "/pages/creator-claim/creator-claim" }); },
});
