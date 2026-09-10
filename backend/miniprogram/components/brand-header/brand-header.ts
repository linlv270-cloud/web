function brandMetricsStyle() {
  try {
    const wxApi = wx as any;
    const windowInfo = typeof wxApi.getWindowInfo === "function" ? wxApi.getWindowInfo() : wxApi.getSystemInfoSync();
    const menu = typeof wxApi.getMenuButtonBoundingClientRect === "function"
      ? wxApi.getMenuButtonBoundingClientRect()
      : null;
    const statusBarHeight = Number(windowInfo?.statusBarHeight || 20);
    const hasValidCapsule = Number(menu?.width || 0) > 0 && Number(menu?.bottom || 0) > statusBarHeight;
    const capsuleBottom = hasValidCapsule ? Number(menu.bottom) : statusBarHeight + 44;
    const safeHeight = Math.min(120, Math.max(44, statusBarHeight + 8, capsuleBottom + 8));
    return `--brand-safe-height:${Math.ceil(safeHeight)}px`;
  } catch {
    return "--brand-safe-height:64px";
  }
}

function hideUserShareMenu() {
  const wxApi = wx as any;
  if (typeof wxApi.hideShareMenu === "function") {
    wxApi.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"] });
  }
}

Component({
  properties: {
    compact: { type: Boolean, value: false },
    immersive: { type: Boolean, value: false },
    showCity: { type: Boolean, value: false },
    cityLabel: { type: String, value: "北京" },
    cityColumns: { type: Array, value: [] },
    cityIndexes: { type: Array, value: [0, 0] },
  },
  data: {
    brandMetricsStyle: "--brand-safe-height:64px",
  },
  lifetimes: {
    attached(this: any) {
      hideUserShareMenu();
      this.setData({ brandMetricsStyle: brandMetricsStyle() });
    },
  },
  pageLifetimes: {
    show() { hideUserShareMenu(); },
  },
  methods: {
    home(this: any) {
      const pages = getCurrentPages();
      const route = pages[pages.length - 1]?.route || "";
      if (route !== "pages/index/index") wx.reLaunch({ url: "/pages/index/index" });
    },
    cityColumnChange(this: any, event: any) { this.triggerEvent("citycolumnchange", event.detail); },
    cityChange(this: any, event: any) { this.triggerEvent("citychange", event.detail); },
  },
});
