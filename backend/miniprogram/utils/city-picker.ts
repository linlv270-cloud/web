import { provinceEntries as generatedProvinceEntries, type ProvinceEntry } from "./china-city-data";

const fallbackProvince: ProvinceEntry = {
  code: "110000",
  name: "北京市",
  cities: [{ code: "110000", name: "北京市" }],
};

export const cityPickerEntries = generatedProvinceEntries.length
  ? generatedProvinceEntries
  : [fallbackProvince];

function citiesForProvince(province: ProvinceEntry = fallbackProvince) {
  return province.cities.length
    ? province.cities
    : [{ code: province.code, name: province.name }];
}

export function cityPickerState(provinceName = "北京市", cityName = "北京市") {
  const provinceIndex = Math.max(0, cityPickerEntries.findIndex((item) => item.name === provinceName));
  const cities = citiesForProvince(cityPickerEntries[provinceIndex]);
  const cityIndex = Math.max(0, cities.findIndex((item) => item.name === cityName));
  return {
    cityColumns: [cityPickerEntries.map((item) => item.name), cities.map((item) => item.name)],
    cityIndexes: [provinceIndex, cityIndex],
  };
}

export function cityPickerColumnState(indexes: number[], column: number, value: number) {
  if (column === 0) {
    const province = cityPickerEntries[value] || cityPickerEntries[0];
    return {
      cityColumns: [cityPickerEntries.map((item) => item.name), citiesForProvince(province).map((item) => item.name)],
      cityIndexes: [value, 0],
    };
  }
  return {
    cityColumns: [
      cityPickerEntries.map((item) => item.name),
      citiesForProvince(cityPickerEntries[indexes[0]] || cityPickerEntries[0]).map((item) => item.name),
    ],
    cityIndexes: [indexes[0], value],
  };
}

export function cityPickerSelection(indexes: number[]) {
  const province = cityPickerEntries[indexes[0]] || cityPickerEntries[0];
  const city = citiesForProvince(province)[indexes[1]] || citiesForProvince(province)[0];
  return { province: province.name, city: city.name };
}
