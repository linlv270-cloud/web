export const DEFAULT_CONSUMER_LOCATION = { province: "北京市", city: "北京市", district: "" };

export function cityLabel(city = "") {
  return city.replace(/市$/, "") || "北京";
}

export function consumerLocation() {
  const saved = wx.getStorageSync("qideng_location");
  return saved?.city
    ? { province: saved.province || "", city: saved.city, district: "" }
    : { ...DEFAULT_CONSUMER_LOCATION };
}

export function saveConsumerLocation(location: any) {
  const value = {
    province: location?.province || "",
    city: location?.city || DEFAULT_CONSUMER_LOCATION.city,
    district: "",
  };
  wx.setStorageSync("qideng_location", value);
  return value;
}
