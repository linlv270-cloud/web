import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import ci from "miniprogram-ci";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const versionSource = fs.readFileSync(path.join(root, "lib/version.ts"), "utf8");
const appid = String(projectConfig.appid || "").trim();
const version = String(packageJson.version || "").trim();
const description = String(process.env.MINI_UPLOAD_DESC || "new1.1 注册手机号直联与上线收口").trim().slice(0, 40);
const privateKeyPath = process.env.MINI_PRIVATE_KEY_PATH
  ? path.resolve(process.env.MINI_PRIVATE_KEY_PATH)
  : path.join(root, `.secrets/private.${appid}.key`);

if (!appid) throw new Error("project.config.json 缺少小程序 AppID");
if (!version || !versionSource.includes(`APP_VERSION = "${version}"`)) {
  throw new Error("小程序上传已停止：package.json 与 lib/version.ts 的版本不一致");
}
if (!fs.existsSync(privateKeyPath)) throw new Error("小程序上传已停止：CI 私钥文件不存在");

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  }).sort();
}

const digest = crypto.createHash("sha256");
for (const file of sourceFiles(path.join(root, "miniprogram"))) {
  digest.update(path.relative(root, file));
  digest.update(fs.readFileSync(file));
}
const sourceSha256 = digest.digest("hex");

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: root,
  privateKeyPath,
  ignores: ["node_modules/**/*", ".next/**/*", "data/**/*", "artifacts/**/*"],
});

await ci.upload({
  project,
  version,
  desc: description,
  robot: Number(process.env.MINI_UPLOAD_ROBOT || 1),
  setting: {
    es6: true,
    es7: true,
    minify: true,
    codeProtect: false,
    minifyJS: true,
    minifyWXML: true,
    minifyWXSS: true,
  },
  onProgressUpdate({ status, message }) {
    if (message) process.stdout.write(`[${status || "progress"}] ${message}\n`);
  },
});

const receipt = {
  appid,
  version,
  description,
  sourceSha256,
  uploadedAt: new Date().toISOString(),
};
fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
fs.writeFileSync(
  path.join(root, "artifacts", `miniapp-upload-${version}.json`),
  `${JSON.stringify(receipt, null, 2)}\n`,
);
console.log(`微信开发版本上传成功：${version}`);
console.log(`源码指纹：${sourceSha256}`);
