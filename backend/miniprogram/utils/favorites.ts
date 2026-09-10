export type FavoriteItem = {
  key: string;
  type: "kit" | "project";
  id: number;
  venueId?: number;
  title: string;
  imageUrl: string;
  subtitle: string;
  savedAt: number;
};

const STORAGE_KEY = "qideng_favorites";

export function listFavorites(): FavoriteItem[] {
  const value = wx.getStorageSync(STORAGE_KEY);
  return Array.isArray(value) ? value : [];
}

export function hasFavorite(key: string) {
  return listFavorites().some((item) => item.key === key);
}

export function toggleFavorite(item: FavoriteItem) {
  const current = listFavorites();
  const exists = current.some((favorite) => favorite.key === item.key);
  const next = exists ? current.filter((favorite) => favorite.key !== item.key) : [item, ...current].slice(0, 100);
  wx.setStorageSync(STORAGE_KEY, next);
  return !exists;
}

export function removeFavorite(key: string) {
  wx.setStorageSync(STORAGE_KEY, listFavorites().filter((item) => item.key !== key));
}
