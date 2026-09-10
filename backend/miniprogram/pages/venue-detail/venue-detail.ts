import { absoluteAsset, request } from "../../utils/api";

Page({
  data: { id: 0, detail: null as any, coverUrl: "" },
  async onLoad(query: any) {
    const id = Number(query.id || 0);
    this.setData({ id });
    try {
      const detail = await request<any>(`/api/mini/workshop/venues/${id}`, { silent: true, cacheMs: 120000 });
      this.setData({ detail, coverUrl: absoluteAsset(detail.venue.coverUrl) || "/assets/self-play-fallback-alt.jpg" });
    } catch {
      wx.showModal({ title: "体验点有变化", content: "这个体验点暂时看不到了。", showCancel: false, success: () => wx.navigateBack() });
    }
  },
  back() { wx.navigateBack(); },
  openKit(event: any) {
    wx.navigateTo({ url: `/pages/kit-detail/kit-detail?id=${event.currentTarget.dataset.kitId}&venueId=${this.data.id}` });
  },
  openMap() {
    const venue = this.data.detail?.venue;
    if (!venue?.latitude || !venue?.longitude) {
      wx.setClipboardData({ data: `${venue?.city || ""}${venue?.district || ""}${venue?.address || ""}`, success: () => wx.showToast({ title: "地址已复制", icon: "none" }) });
      return;
    }
    wx.openLocation({ latitude: Number(venue.latitude), longitude: Number(venue.longitude), name: venue.name, address: venue.address });
  },
});
