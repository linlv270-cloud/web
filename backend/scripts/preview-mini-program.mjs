import fs from "node:fs";
import path from "node:path";
import ci from "miniprogram-ci";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const appid = String(projectConfig.appid || "").trim();
const version = String(packageJson.version || "").trim();
const privateKeyPath = process.env.MINI_PRIVATE_KEY_PATH
  ? path.resolve(process.env.MINI_PRIVATE_KEY_PATH)
  : path.join(root, `.secrets/private.${appid}.key`);
const outputDirectory = path.join(root, "artifacts");
const qrcodeOutputDest = path.join(outputDirectory, `miniapp-preview-${version}.png`);

if (!appid) throw new Error("project.config.json 缺少小程序 AppID");
if (!fs.existsSync(privateKeyPath)) throw new Error("临时预览已停止：CI 私钥文件不存在");

fs.mkdirSync(outputDirectory, { recursive: true });

const project = new ci.Project({
  appid,
  type: "miniProgram",
  projectPath: root,
  privateKeyPath,
  ignores: ["node_modules/**/*", ".next/**/*", "data/**/*", "artifacts/**/*"],
});

await ci.preview({
  project,
  desc: `奇灯 ${version} 临时预览`,
  robot: Number(process.env.MINI_UPLOAD_ROBOT || 1),
  pagePath: "pages/index/index",
  qrcodeFormat: "image",
  qrcodeOutputDest,
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

console.log(`手机临时预览二维码已生成：${qrcodeOutputDest}`);
