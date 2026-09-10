import { ensureConsumerSession, request } from "../../utils/api";

Page({
  data: { code: "", agreed: false, submitting: false, ready: false },
  async onLoad() {
    try {
      await ensureConsumerSession();
      this.setData({ ready: true });
    } catch {
      wx.showToast({ title: "微信登录失败，请稍后重试", icon: "none" });
    }
  },
  back() { wx.navigateBack(); },
  codeInput(event: any) {
    const code = String(event.detail.value || "").toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, "").slice(0, 8);
    this.setData({ code });
  },
  toggleAgreement() { this.setData({ agreed: !this.data.agreed }); },
  legal() { wx.navigateTo({ url: "/pages/legal/legal?type=privacy" }); },
  async claim(event: any) {
    if (this.data.submitting) return;
    if (this.data.code.length !== 8) return wx.showToast({ title: "请输入8位认领码", icon: "none" });
    if (!this.data.agreed) return wx.showToast({ title: "请先确认认领并同意隐私政策", icon: "none" });
    const phoneCode = String(event.detail?.code || "");
    if (!phoneCode && !wx.getStorageSync("qideng_mock_phone"))
      return wx.showToast({ title: "需要授权登记手机号完成认领", icon: "none" });
    this.setData({ submitting: true });
    try {
      const result = await request<any>("/api/mini/auth/creator-claim", {
        method: "POST",
        data: {
          code: this.data.code,
          phoneCode,
          mockPhone: String(wx.getStorageSync("qideng_mock_phone") || ""),
          agreed: true,
        },
      });
      wx.setStorageSync("qideng_creator_token", result.session.token);
      wx.showToast({ title: "档案认领成功", icon: "success" });
      setTimeout(() => wx.redirectTo({ url: "/pages/creator-profile/creator-profile" }), 350);
    } finally {
      this.setData({ submitting: false });
    }
  },
});
