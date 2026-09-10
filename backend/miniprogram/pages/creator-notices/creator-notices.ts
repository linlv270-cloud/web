import { ensureCreatorSession, request } from "../../utils/api";

Page({
  data: { home: null as any, messages: [] as any[], loading: true },
  async onShow() {
    try {
      await ensureCreatorSession();
      await this.load();
    } catch {
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  async load() {
    const [homeData, data] = await Promise.all([
      request<any>("/api/mini/creator/home", { actor: "creator" }),
      request<any>("/api/mini/creator/dossier", { actor: "creator" }),
    ]);
    this.setData({ home: homeData.home, messages: data.messages || [], loading: false });
  },
  async read(event: any) {
    const id = Number(event.currentTarget.dataset.id);
    const message = this.data.messages.find((item: any) => item.id === id);
    await request("/api/mini/creator/dossier", { actor: "creator", method: "PATCH", data: { action: "readNotice", id } });
    if (String(message?.href || "").startsWith("/pages/"))
      return wx.navigateTo({ url: message.href });
    await this.load();
  },
});
