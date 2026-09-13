const required = [
  "DATA_DIR",
  "PUBLIC_SITE_URL",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD",
];

const placeholders = new Set(["", "SET_ON_SERVER_ONLY", "changeme", "CHANGE_ME", "your-key-here"]);
const failures = [];
const warnings = [];

for (const key of required) {
  const value = process.env[key] || "";
  if (placeholders.has(value)) failures.push(`${key} 未配置`);
}

if (process.env.DATA_DIR !== "/opt/tde/data") failures.push("DATA_DIR 必须为 /opt/tde/data");
if (!/^https:\/\/tde\.thedesignexpo\.org\.cn\/?$/.test(process.env.PUBLIC_SITE_URL || ""))
  failures.push("PUBLIC_SITE_URL 必须为 https://tde.thedesignexpo.org.cn");
if ((process.env.ADMIN_PASSWORD || "").length < 12) {
  if (process.env.TDE_ALLOW_EXISTING_ADMIN_PASSWORD === "YES") {
    warnings.push("沿用现有 PM2 管理员密码：长度少于 12 位；本次未修改凭据，后续应更换为至少 12 位密码");
  } else {
    failures.push("ADMIN_PASSWORD 长度至少 12 位");
  }
}
if (process.env.ADMIN_PASSWORD === "admin123456" || process.env.ADMIN_PASSWORD === "test123456")
  failures.push("ADMIN_PASSWORD 仍是旧示例密码，必须在服务器环境变量中更换");

const bootstrapInviteCode = (process.env.QIDENG_BOOTSTRAP_INVITE_CODE || "").trim().toUpperCase();
if (bootstrapInviteCode && !/^[A-Z0-9]{4,8}$/.test(bootstrapInviteCode))
  failures.push("QIDENG_BOOTSTRAP_INVITE_CODE 必须为4至8位字母或数字");
if (bootstrapInviteCode === "QIDENG26")
  failures.push("生产环境不能使用测试邀请码 QIDENG26");
else if (bootstrapInviteCode)
  warnings.push("已配置一次性启动邀请码；首次建库后请清空该环境变量，并在后台管理邀请码状态");

if (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_SALT)
  warnings.push("ADMIN_PASSWORD_HASH/ADMIN_PASSWORD_SALT 当前代码不会读取，请使用 ADMIN_USERNAME/ADMIN_PASSWORD");

if (failures.length) {
  console.error("生产环境变量检查未通过：");
  for (const item of failures) console.error(`- ${item}`);
  for (const item of warnings) console.error(`- 警告：${item}`);
  process.exitCode = 1;
} else {
  console.log("生产环境变量检查通过。");
  if (warnings.length) {
    console.log("提醒：");
    for (const item of warnings) console.log(`- ${item}`);
  }
}
