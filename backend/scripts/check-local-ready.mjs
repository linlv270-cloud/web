import { spawnSync } from "node:child_process";

const steps = [
  ["check:launch", ["npm", ["run", "check:launch"]]],
  ["check:workshop-rules", ["npm", ["run", "check:workshop-rules"]]],
  ["lint", ["npm", ["run", "lint"]]],
  ["build", ["npm", ["run", "build"]]],
  ["check:release-package", ["npm", ["run", "check:release-package"]]],
];

for (const [label, [command, args]] of steps) {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    console.error(`\n本地上线门禁未通过：${label}`);
    process.exit(result.status || 1);
  }
}

console.log("\n快速本地上线门禁通过。全量测试请在需要深度回归时单独运行 npm run test。外部生产配置仍需在服务器、微信后台和企业微信内部通知侧完成；当前手动选城不依赖腾讯位置配额。");
