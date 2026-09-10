import { request } from "../../utils/api";
import { cityPickerColumnState, cityPickerSelection, cityPickerState } from "../../utils/city-picker";
import { filteredPosters, homePosters, kitPoster, mergePosters, operationTabs, sceneChoices } from "../../utils/content-discovery";
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
    scene: "",
    filterOpen: false,
    filterCount: 0,
    allCards: [] as any[],
    filteredCards: [] as any[],
    cards: [] as any[],
    visibleCount: initialFeedSize,
    contactCopy: "联系官方微信、联系官方小红书",
  },
  onLoad(query: any) {
    const location = consumerLocation();
    this.setData({
      location,
      cityText: cityLabel(location.city),
      scene: String(query.scene || query.tag || ""),
      ...cityPickerState(location.province, location.city),
    });
    this.load();
  },
  onShow() {
    const location = consumerLocation();
    if (location.city === this.data.location?.city) return;
    this.setData({ location, cityText: cityLabel(location.city), ...cityPickerState(location.province, location.city) });
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const city = this.data.location.city;
      const [data, home] = await Promise.all([
        request<any>(`/api/mini/workshop/self-play?city=${encodeURIComponent(city)}`, { silent: true, cacheMs: 60000 }),
        request<any>(`/api/mini/workshop/home?city=${encodeURIComponent(city)}`, { silent: true, cacheMs: 60000 }),
      ]);
      const baseCards = (data.venueKits || []).map(kitPoster);
      const allowed = new Set(baseCards.map((card: any) => card.key));
      const editorial = homePosters(home).filter((card: any) => card.kind === "self" && allowed.has(card.key));
      const allCards = mergePosters([...editorial, ...baseCards]);
      this.setData({ allCards, contactCopy: home.settings?.contactCopy || this.data.contactCopy, loading: false });
      this.render();
    } catch {
      this.setData({ loading: false, allCards: [], cards: [] });
    }
  },
  render(reset = true) {
    const filteredCards = filteredPosters(this.data.allCards, { operation: this.data.operation, mode: "self", scene: this.data.scene });
    const visibleCount = reset ? initialFeedSize : this.data.visibleCount;
    this.setData({ filteredCards, cards: filteredCards.slice(0, visibleCount), visibleCount, filterCount: Number(Boolean(this.data.scene)) });
  },
  onReachBottom() {
    if (this.data.cards.length >= this.data.filteredCards.length) return;
    const visibleCount = this.data.visibleCount + feedPageSize;
    this.setData({ visibleCount, cards: this.data.filteredCards.slice(0, visibleCount) });
  },
  cityColumnChange(event: any) {
    this.setData(cityPickerColumnState(this.data.cityIndexes, Number(event.detail.column || 0), Number(event.detail.value || 0)));
  },
  selectCity(event: any) {
    const indexes = [Number(event.detail.value?.[0] || 0), Number(event.detail.value?.[1] || 0)];
    const location = saveConsumerLocation(cityPickerSelection(indexes));
    this.setData({ location, cityText: cityLabel(location.city), operation: "all", scene: "", ...cityPickerState(location.province, location.city) });
    this.load();
  },
  selectOperation(event: any) {
    this.setData({ operation: String(event.currentTarget.dataset.value || "all") });
    this.render();
  },
  openFilter() { this.setData({ filterOpen: true }); },
  closeFilter() { this.setData({ filterOpen: false }); },
  keepSheetOpen() {},
  selectScene(event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ scene: this.data.scene === value ? "" : value });
  },
  clearFilters() { this.setData({ scene: "" }); },
  applyFilters() { this.setData({ filterOpen: false }); this.render(); },
  openCard(event: any) {
    const card = event.detail;
    wx.navigateTo({ url: `/pages/kit-detail/kit-detail?id=${card.kitId}&venueId=${card.venueId}` });
  },
  applyCreator() { wx.navigateTo({ url: "/pages/creator-register/creator-register" }); },
  contact() { wx.showModal({ title: "联系奇灯", content: this.data.contactCopy, showCancel: false, confirmText: "知道了" }); },
});
