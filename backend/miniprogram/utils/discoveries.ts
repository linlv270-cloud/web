export type DiscoveryItem = {
  key: string;
  type: "kit" | "project";
  id: number;
  venueId?: number;
  title: string;
  imageUrl: string;
  subtitle: string;
  discoveredAt: number;
};

const STORAGE_KEY = "qideng_recent_discoveries";

export function listDiscoveries(): DiscoveryItem[] {
  const value = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(value) ? value : [];
}

export function recordDiscovery(item: DiscoveryItem) {
  const next = [item, ...listDiscoveries().filter((current) => current.key !== item.key)].slice(0, 30);
  wx.setStorageSync(STORAGE_KEY, next);
  return next;
}
