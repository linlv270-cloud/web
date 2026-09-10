import { request } from "../../utils/api";
import { cityPickerColumnState, cityPickerSelection, cityPickerState } from "../../utils/city-picker";
import { availableInterests, discoverySections, filteredPosters, homePosters, operationTabs, sceneChoices, sceneOptions } from "../../utils/content-discovery";
import { cityLabel, consumerLocation, saveConsumerLocation } from "../../utils/location";

const initialFeedSize = 12;
const feedPageSize = 8;

Page({
  data: {
    loading: true,
    location: consumerLocation(),
    cityText: "北京",
    ...cityPickerState(),
    operationTabs,
    operation: "all",
    sceneChoices,
    sceneOptions,
    mode: "all",
    scene: "",
    interest: "",
    date: "",
    filterOpen: false,
    filterCount: 0,
    allCards: [] as any[],
    featuredCards: [] as any[],
    todayCards: [] as any[],
    todayPool: [] as any[],
    todayVisibleCount: initialFeedSize,
    interestChoices: [] as string[],
    resultCount: 0,
    cityEmpty: false,
    contactCopy: "联系官方微信、联系官方小红书",
  },
  onLoad() {
    const location = consumerLocation();
    this.setData({ location, cityText: cityLabel(location.city), ...cityPickerState(location.province, location.city) });
    this.load();
  },
  onShow() {
    const location = consumerLocation();
    if (location.city === this.data.location?.city) return;
    this.setData({ location, cityText: cityLabel(location.city), ...cityPickerState(location.province, location.city) });
    this.load();
  },
  async load() {
    this.setData({ loading: true, cityEmpty: false });
    try {
      const home = await request<any>(`/api/mini/workshop/home?city=${encodeURIComponent(this.data.location.city)}`, { silent: true, cacheMs: 60000 });
      const allCards = homePosters(home);
      this.setData({
        allCards,
        interestChoices: availableInterests(allCards),
        cityEmpty: Number(home.discoveryCount || 0) === 0,
        contactCopy: home.settings?.contactCopy || this.data.contactCopy,
        loading: false,
      });
      this.render();
    } catch {
      this.setData({ loading: false, cityEmpty: true, allCards: [], featuredCards: [], todayCards: [], resultCount: 0 });
    }
  },
  render(reset = true) {
    const cards = filteredPosters(this.data.allCards, {
      operation: this.data.operation,
      mode: this.data.mode,
      scene: this.data.scene,
      interest: this.data.interest,
      date: this.data.date,
    });
    const sections = discoverySections(cards);
    const filterCount = [this.data.mode !== "all", Boolean(this.data.scene), Boolean(this.data.interest), Boolean(this.data.date)].filter(Boolean).length;
    const todayVisibleCount = reset ? initialFeedSize : this.data.todayVisibleCount;
    this.setData({
      featuredCards: sections.featured,
      todayPool: sections.today,
      todayCards: sections.today.slice(0, todayVisibleCount),
      todayVisibleCount,
      resultCount: cards.length,
      filterCount,
    });
  },
  onReachBottom() {
    if (this.data.todayCards.length >= this.data.todayPool.length) return;
    const todayVisibleCount = this.data.todayVisibleCount + feedPageSize;
    this.setData({ todayVisibleCount, todayCards: this.data.todayPool.slice(0, todayVisibleCount) });
  },
  cityColumnChange(event: any) {
    const column = Number(event.detail.column || 0);
    const value = Number(event.detail.value || 0);
    this.setData(cityPickerColumnState(this.data.cityIndexes, column, value));
  },
  selectCity(event: any) {
    const indexes = [Number(event.detail.value?.[0] || 0), Number(event.detail.value?.[1] || 0)];
    const location = saveConsumerLocation(cityPickerSelection(indexes));
    this.setData({
      location,
      cityText: cityLabel(location.city),
      operation: "all",
      mode: "all",
      scene: "",
      interest: "",
      date: "",
      ...cityPickerState(location.province, location.city),
    });
    this.load();
  },
  selectOperation(event: any) {
    this.setData({ operation: String(event.currentTarget.dataset.value || "all") });
    this.render();
  },
  selectQuickScene(event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ scene: this.data.scene === value ? "" : value });
    this.render();
  },
  openFilter() { this.setData({ filterOpen: true }); },
  closeFilter() { this.setData({ filterOpen: false }); },
  keepSheetOpen() {},
  selectMode(event: any) {
    const value = String(event.currentTarget.dataset.value || "all");
    this.setData({ mode: value, ...(value === "self" ? { date: "" } : {}) });
  },
  selectFilterScene(event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ scene: this.data.scene === value ? "" : value });
  },
  selectInterest(event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ interest: this.data.interest === value ? "" : value, mode: value ? "companion" : this.data.mode });
  },
  dateChange(event: any) { this.setData({ date: String(event.detail.value || ""), mode: "companion" }); },
  clearDate() { this.setData({ date: "" }); },
  clearFilters() { this.setData({ mode: "all", scene: "", interest: "", date: "" }); },
  applyFilters() { this.setData({ filterOpen: false }); this.render(); },
  openCard(event: any) {
    const card = event.detail;
    const url = card.kind === "companion"
      ? `/pages/project-detail/project-detail?id=${card.id}`
      : `/pages/kit-detail/kit-detail?id=${card.kitId}&venueId=${card.venueId}`;
    wx.navigateTo({ url });
  },
  applyCreator() { wx.navigateTo({ url: "/pages/creator-register/creator-register" }); },
  contact() { wx.showModal({ title: "联系奇灯", content: this.data.contactCopy, showCancel: false, confirmText: "知道了" }); },
});
