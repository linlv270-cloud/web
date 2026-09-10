import areaData from "./china-area-data.json";

type AreaData = Record<string, Record<string, string>>;
const data = areaData as AreaData;
const municipalities = new Set(["北京市", "天津市", "上海市", "重庆市"]);
const overseasCities = [
  { code: "overseas-japan", name: "日本", districts: ["东京都", "大阪府", "京都府", "神奈川县", "千叶县", "埼玉县", "爱知县", "福冈县", "北海道", "兵库县", "其他地区"] },
  { code: "overseas-korea", name: "韩国", districts: ["首尔特别市", "釜山广域市", "仁川广域市", "大邱广域市", "京畿道", "济州特别自治道", "其他地区"] },
  { code: "overseas-us", name: "美国", districts: ["纽约州", "加利福尼亚州", "德克萨斯州", "佛罗里达州", "华盛顿州", "其他州"] },
  { code: "overseas-europe", name: "欧洲", districts: ["英国", "法国", "德国", "意大利", "西班牙", "荷兰", "瑞士", "其他国家"] },
  { code: "overseas-sea", name: "东南亚", districts: ["新加坡", "马来西亚", "泰国", "越南", "印度尼西亚", "菲律宾", "其他国家"] },
  { code: "overseas-other", name: "其他", districts: ["其他国家和地区"] },
];

export const provinces = Object.entries(data["86"] || {}).map(([code, name]) => ({ code, name }));

export function citiesForProvince(code: string) {
  const province = data["86"]?.[code] || "";
  const cities = Object.entries(data[code] || {}).map(([cityCode, name]) => ({ code: cityCode, name: name === "市辖区" && municipalities.has(province) ? province : name }));
  return cities.length ? cities : province ? [{ code, name: province }] : [];
}

export function districtsForCity(cityCode: string) {
  return Object.entries(data[cityCode] || {}).map(([code, name]) => ({ code, name }));
}

export function locationPayload() {
  return [...provinces.map((province) => ({
    ...province,
    cities: citiesForProvince(province.code).map((city) => ({
      ...city,
      districts: districtsForCity(city.code),
    })),
  })), {
    code: "overseas",
    name: "海外",
    cities: overseasCities.map((city) => ({
      code: city.code,
      name: city.name,
      districts: city.districts.map((name, index) => ({ code: `${city.code}-${index + 1}`, name })),
    })),
  }];
}

export function isValidLocation(provinceName: string, cityName: string, districtName = "") {
  if (provinceName === "海外") {
    const city = overseasCities.find((item) => item.name === cityName);
    return Boolean(city && (!districtName || city.districts.includes(districtName)));
  }
  const province = provinces.find((item) => item.name === provinceName);
  const city = province && citiesForProvince(province.code).find((item) => item.name === cityName);
  if (!city) return false;
  return !districtName || districtsForCity(city.code).some((item) => item.name === districtName);
}
