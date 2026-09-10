import { request } from "../../utils/api";
import { cityPickerColumnState, cityPickerSelection, cityPickerState } from "../../utils/city-picker";
import { kitPoster, mergePosters, projectPoster } from "../../utils/content-discovery";
import { cityLabel, consumerLocation, saveConsumerLocation } from "../../utils/location";

const initialFeedSize = 12;
const feedPageSize = 8;

Page({
  data: {
    loading: true,
    tag: "",
    mode: "all",
    location: consumerLocation(),
    cityText: "北京",
    ...cityPickerState(),
    allCards: [] as any[],
    cards: [] as any[],
    visibleCount: initialFeedSize,
  },
  onLoad(query: any) {
    let tag = String(query.tag || "");
    try { tag = decodeURIComponent(tag); } catch { /* Keep readable input. */ }
    const location = consumerLocation();
    this.setData({ tag, mode: ["all", "self", "companion"].includes(query.mode) ? query.mode : "all", location, cityText: cityLabel(location.city), ...cityPickerState(location.province, location.city) });
    this.load();
  },
  async load() {
    this.setData({ loading: true });
    try {
      const city = this.data.location.city;
      const response = await request<any>(`/api/mini/workshop/explore?tag=${encodeURIComponent(this.data.tag)}&mode=${this.data.mode}&city=${encodeURIComponent(city)}`, { silent: true, cacheMs: 60000 });
      const cards = mergePosters([
        ...(response.companion || []).map(projectPoster),
        ...(response.selfPlay || []).map(kitPoster),
      ]);
      this.setData({ allCards: cards, cards: cards.slice(0, initialFeedSize), visibleCount: initialFeedSize, loading: false });
    } catch {
      this.setData({ cards: [], loading: false });
    }
  },
  onReachBottom() {
    if (this.data.cards.length >= this.data.allCards.length) return;
    const visibleCount = this.data.visibleCount + feedPageSize;
    this.setData({ visibleCount, cards: this.data.allCards.slice(0, visibleCount) });
  },
  cityColumnChange(event: any) {
    this.setData(cityPickerColumnState(this.data.cityIndexes, Number(event.detail.column || 0), Number(event.detail.value || 0)));
  },
  selectCity(event: any) {
    const indexes = [Number(event.detail.value?.[0] || 0), Number(event.detail.value?.[1] || 0)];
    const location = saveConsumerLocation(cityPickerSelection(indexes));
    this.setData({ location, cityText: cityLabel(location.city), ...cityPickerState(location.province, location.city) });
    this.load();
  },
  openCard(event: any) {
    const card = event.detail;
    if (card.kind === "companion") return wx.navigateTo({ url: `/pages/project-detail/project-detail?id=${card.id}` });
    wx.navigateTo({ url: `/pages/kit-detail/kit-detail?id=${card.kitId}&venueId=${card.venueId}` });
  },
});
