import { request } from "../../utils/api";
import { cityPickerColumnState, cityPickerSelection, cityPickerState } from "../../utils/city-picker";
import { availableInterests, filteredPosters, homePosters, mergePosters, operationTabs, projectPoster, sceneChoices } from "../../utils/content-discovery";
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
    interest: "",
    date: "",
    filterOpen: false,
    filterCount: 0,
    allCards: [] as any[],
    filteredCards: [] as any[],
    cards: [] as any[],
    visibleCount: initialFeedSize,
    interestChoices: [] as string[],
    cityHasProjects: false,
    contactCopy: "联系官方微信、联系官方小红书",
  },
  onLoad(query: any) {
    const location = consumerLocation();
    this.setData({
      location,
      cityText: cityLabel(location.city),
      scene: String(query.scene || ""),
      interest: String(query.tag || ""),
      date: String(query.date || ""),
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
      const date = this.data.date ? `&date=${encodeURIComponent(this.data.date)}` : "";
      const [data, home] = await Promise.all([
        request<any>(`/api/mini/workshop/companion?city=${encodeURIComponent(city)}${date}`, { silent: true, cacheMs: 60000 }),
        request<any>(`/api/mini/workshop/home?city=${encodeURIComponent(city)}`, { silent: true, cacheMs: 60000 }),
      ]);
      const baseCards = (data.projects || []).map(projectPoster);
      const allowed = new Set(baseCards.map((card: any) => card.key));
      const cityCards = homePosters(home).filter((card: any) => card.kind === "companion");
      const editorial = cityCards.filter((card: any) => allowed.has(card.key));
      const allCards = mergePosters([...editorial, ...baseCards]);
      this.setData({
        allCards,
        interestChoices: availableInterests(allCards),
        cityHasProjects: cityCards.length > 0,
        contactCopy: home.settings?.contactCopy || this.data.contactCopy,
        loading: false,
      });
      this.render();
    } catch {
      this.setData({ loading: false, allCards: [], cards: [], interestChoices: [] });
    }
  },
  render(reset = true) {
    const filteredCards = filteredPosters(this.data.allCards, { operation: this.data.operation, mode: "companion", scene: this.data.scene, interest: this.data.interest, date: this.data.date });
    const filterCount = [Boolean(this.data.scene), Boolean(this.data.interest), Boolean(this.data.date)].filter(Boolean).length;
    const visibleCount = reset ? initialFeedSize : this.data.visibleCount;
    this.setData({ filteredCards, cards: filteredCards.slice(0, visibleCount), visibleCount, filterCount });
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
    this.setData({ location, cityText: cityLabel(location.city), operation: "all", scene: "", interest: "", date: "", ...cityPickerState(location.province, location.city) });
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
  selectInterest(event: any) {
    const value = String(event.currentTarget.dataset.value || "");
    this.setData({ interest: this.data.interest === value ? "" : value });
  },
  dateChange(event: any) { this.setData({ date: String(event.detail.value || "") }); },
  clearDate() { this.setData({ date: "" }); },
  clearFilters() { this.setData({ scene: "", interest: "", date: "" }); },
  applyFilters() { this.setData({ filterOpen: false }); this.load(); },
  openCard(event: any) { wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${event.detail.id}` }); },
  applyCreator() { wx.navigateTo({ url: "/pages/creator-register/creator-register" }); },
  contact() { wx.showModal({ title: "联系奇灯", content: this.data.contactCopy, showCancel: false, confirmText: "知道了" }); },
});
