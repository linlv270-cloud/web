import { QIDENG_EDITORIAL_FONT_SOURCE } from "./utils/editorial-font";

function loadEditorialFont() {
  if (typeof wx.loadFontFace !== "function") return;
  wx.loadFontFace({
    family: "Qideng Editorial",
    source: QIDENG_EDITORIAL_FONT_SOURCE,
    global: true,
  });
}

App({
  globalData: {
    settings: null,
    location: null,
  },
  onLaunch() {
    loadEditorialFont();
    const savedLocation = wx.getStorageSync("qideng_location");
    if (savedLocation) this.globalData.location = savedLocation;
  },
});
