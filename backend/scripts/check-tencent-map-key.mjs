const key = process.env.TENCENT_MAP_KEY || process.argv[2] || "";
const required = process.env.TENCENT_MAP_REQUIRED === "true" || process.argv.includes("--required");

if (!key || key === "SET_ON_SERVER_ONLY") {
  const message = "腾讯地图自动定位未配置；当前手动选择省市和微信原生导航不受影响。";
  if (required) {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(message);
  }
} else {
  const endpoint = new URL("https://apis.map.qq.com/ws/geocoder/v1/");
  endpoint.searchParams.set("location", "31.2304,121.4737");
  endpoint.searchParams.set("key", key);
  endpoint.searchParams.set("get_poi", "0");

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
    const data = await response.json();
    const component = data.result?.address_component || {};
    if (!response.ok || data.status !== 0 || !component.city) {
      const lines = [
        `status: ${data.status ?? response.status}`,
        `message: ${data.message || response.statusText}`,
      ];
      const output = required ? console.error : console.warn;
      output(required ? "腾讯地图 Key 验证未通过：" : "腾讯地图自动定位当前不可用，不影响手动选择省市：");
      for (const line of lines) output(`- ${line}`);
      if (required) process.exitCode = 1;
    } else {
      console.log("腾讯地图 Key 验证通过：");
      console.log(`- province: ${component.province || ""}`);
      console.log(`- city: ${component.city || ""}`);
      console.log(`- district: ${component.district || ""}`);
    }
  } catch (error) {
    const message = `腾讯地图自动定位验证失败：${error instanceof Error ? error.message : String(error)}`;
    (required ? console.error : console.warn)(message);
    if (required) process.exitCode = 1;
  }
}
