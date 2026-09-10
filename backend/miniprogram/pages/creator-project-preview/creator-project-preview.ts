Page({
  data: {
    preview: null as any,
  },
  onLoad() {
    const stored = wx.getStorageSync("qideng_creator_project_preview");
    if (!stored) {
      wx.showModal({
        title: "预览已失效",
        content: "请返回体验页重新预览。",
        showCancel: false,
        success: () => wx.navigateBack(),
      });
      return;
    }
    const availableDates = [...new Set<string>((stored.availableDates || []).map(String))].sort();
    const difficultyLabel = ({ easy: "零基础友好", medium: "需要一点经验", hard: "进阶体验" } as Record<string, string>)[stored.difficulty] || "未设置";
    this.setData({
      preview: {
        ...stored,
        availableDates,
        peopleLabel: `${stored.minPeople || 1}-${stored.maxPeople || stored.minPeople || 1}人 · ${stored.durationMinutes || "-"}分钟`,
        priceLabel: Number(stored.priceCents || 0) > 0 ? `¥${(Number(stored.priceCents) / 100).toFixed(0)} 起` : "现场了解",
        difficultyLabel,
      },
    });
  },
  back() {
    wx.navigateBack();
  },
  imageError() {
    this.setData({ "preview.imageUrl": "/assets/companion-fallback.jpg" });
  },
});
