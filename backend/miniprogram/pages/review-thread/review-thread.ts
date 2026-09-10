import { ensureCreatorSession, request } from "../../utils/api";

Page({
  data: { id: 0, thread: null as any, body: "", loading: true, sending: false },
  async onLoad(query: any) {
    this.setData({ id: Number(query.id || 0) });
    try {
      await ensureCreatorSession();
      await this.load();
    } catch {
      wx.redirectTo({ url: "/pages/mine/mine" });
    }
  },
  async load() {
    const data = await request<any>(`/api/mini/creator/reviews?id=${this.data.id}`, { actor: "creator" });
    this.setData({ thread: data.thread, loading: false });
  },
  back() { wx.navigateBack(); },
  input(event: any) { this.setData({ body: event.detail.value }); },
  async send() {
    const body = String(this.data.body || "").trim();
    if (!body || this.data.sending) return;
    this.setData({ sending: true });
    try {
      const data = await request<any>("/api/mini/creator/reviews", {
        actor: "creator",
        method: "POST",
        data: { id: this.data.id, body },
      });
      this.setData({ thread: data.thread, body: "" });
      wx.showToast({ title: "回复已发送", icon: "success" });
    } finally {
      this.setData({ sending: false });
    }
  },
});
