# 奇灯兴趣试玩工坊工程迁移基线

更新时间：2026-08-13

## 来源工程

- 来源目录：`/Users/llmac/Documents/Codex/2026-07-25/nih/work/qideng-mini-program-platform`
- 来源项目名：`qideng-mini-program-platform`
- 来源版本：`0.16.0`
- 迁移方式：复制源码、配置、部署脚本、测试和小程序目录；不复制依赖、构建缓存、临时测试数据和发布缓存。

## 当前工程

- 当前目录：`/Users/llmac/Documents/Codex/2026-08-12/qideng-trial-workshop-visual-system/work/qideng-workshop-platform`
- 当前项目名：`qideng-workshop-platform`
- 当前版本：`0.1.0-migration`
- 小程序 AppID：`wx65f33265254f8b02`

## 已跳过目录

- `node_modules`
- `.next`
- `.npm-cache`
- `.preview-data`
- `.release`
- `.tmp-tests`
- `tsconfig.tsbuildinfo`

## 迁移保护规则

- 旧工程目录不修改。
- 当前工程先记录构建和测试基线，再做业务清理。
- 保留旧平台的登录、短信、咨询、创作者端、管理员权限、图片处理、部署和自动测试。
- 保留超级管理员和子管理员对创作者城市、日期、标签、分级、上传、下载、通知的运营管理能力。
- 保留资料下载/导出的权限边界和审计能力：超级管理员可按筛选条件下载资料，子管理员不开放下载。
- 所有旧业务清理必须以当前产品文档为准，不能凭记忆删除基础能力。

## 待记录基线

已执行：

```bash
npm ci --registry=https://registry.npmjs.org/ --cache ./.npm-cache
npm run lint
npm run build
npm run test:mini
```

## 基线结果

### 依赖安装

结果：通过。

说明：

- 默认 npm registry 为 `https://registry.npmmirror.com/`，首次安装因域名解析失败中断。
- 改用官方 registry 后，本机全局 npm 缓存目录存在权限问题。
- 最终使用工程内缓存目录 `./.npm-cache` 完成安装。
- npm audit 基线提示：7 个漏洞，1 low、6 high。迁移第一步暂不升级依赖，避免引入额外变量。

### Lint

结果：通过。

### Build

结果：通过。

构建确认：

- Next.js 编译成功。
- TypeScript 检查通过。
- 静态页面生成完成。
- Standalone 准备脚本执行完成。

### Mini Program Test

结果：通过。

测试摘要：

- 共 8 项测试。
- 8 项通过。
- 0 项失败。

覆盖能力：

- 数据库迁移和公开配置
- 超级管理员、子管理员和范围权限
- 活动维护和图片压缩
- 资料导出和越权下载拦截
- 小程序抽取/推荐基础逻辑
- 用户与创作者咨询流
- 官方客服权限隔离
- 创作者四 Tab 数据和未读计数

## 当前风险

- 业务仍是旧平台逻辑，包含历史页面和文案；下一阶段必须清理。
- npm 依赖存在安全提示，后续进入上线前需要单独评估升级。
- 当前基线只验证旧平台能力可运行，不代表“奇灯兴趣试玩工坊”业务已经完成。

## 阶段 1 第一轮清理记录

已完成：

- 将小程序默认口号改为“试着玩起来才最重要。”
- 将旧“翻灯牌”按钮文案改为“开始看看”。
- 将运行时旧错误提示改成“项目推荐/项目可查看”语义。
- 将后台小程序运营指标中的旧文案改为“项目推荐次数/项目推荐已开放”。
- 将分享页旧口号改为当前口号。
- 将 `package-lock.json` 顶部工程名同步为 `qideng-workshop-platform`。
- 将标签词“美食摊主”改为“美食创作者”。

检查结果：

- 运行时代码旧词扫描通过：`彼里市 / 兴趣地图 / 翻灯牌 / 翻个灯牌 / 奇遇一下 / 自由玩 / 预约试玩 / 可寄材料 / 启灯 / 摊主` 未在 `app`、`lib`、`miniprogram`、`tests`、`package` 和小程序配置中出现。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 首次因本机端口权限失败；开启本地网络权限后重跑通过，8 项测试全部通过。

保留提醒：

- 这轮只做可见旧文案去风险，页面路径和接口名中仍可能存在 `draw` 等旧代码层命名，后续在替换正式自助玩/陪你玩页面时再系统重构。

## 阶段 2 数据底座第一轮记录

已完成：

- 新增自助玩相关数据表：体验点、营业时间、材料包、体验点材料包库存、材料包教程。
- 新增陪你玩相关数据表：创作者项目、在线状态、项目可约日期、项目标签、创作者联系入口。
- 新增首页运营相关数据表：通栏 Banner、限时限量、今日上新、首发尝鲜、好评精选栏目。
- 新增运营闭环相关数据表：积分流水、到店扫码、现场求助、材料包评分、点亮记录。
- 扩展小程序端到端测试，确认上述正式业务表会在数据库迁移时创建。

权限保留：

- 下载/导出继续保持旧后台逻辑：仅超级管理员可用，子管理员不开放下载。
- 子管理员仍保留旧有范围管理能力，可管理自己范围内的创作者资料、项目、图片和小程序活动，但不能越权查看官方客服、导出资料或发送平台级通知。

检查结果：

- 运行时代码旧词扫描通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，8 项测试全部通过。

## 阶段 3 后台接口第一轮记录

已完成：

- 新增后台工作坊概览接口：`/api/admin/workshop/overview`。
- 新增超级管理员全局运营接口：
  - 体验点管理：`/api/admin/workshop/venue`
  - 材料包管理：`/api/admin/workshop/kit`
  - 体验点材料包库存关联：`/api/admin/workshop/venue-kit`
  - 首页 Banner：`/api/admin/workshop/homepage-banner`
  - 首页栏目：`/api/admin/workshop/homepage-slot`
- 新增创作者范围管理接口：
  - 陪你玩项目：`/api/admin/workshop/project`
  - 创作者在线状态：`/api/admin/workshop/presence`
  - 创作者联系入口：`/api/admin/workshop/contact`

权限保留：

- 超级管理员可管理首页、体验点、材料包、库存、创作者项目、在线状态和联系入口。
- 子管理员只可管理自己范围内创作者的陪你玩项目、在线状态和联系入口。
- 子管理员不能创建或修改材料包、体验点、首页 Banner、首页栏目。
- 子管理员仍不能下载资料，下载/导出继续只保留给超级管理员。

检查结果：

- 运行时代码旧词扫描通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 首次因本机端口权限失败；开启本地网络权限后重跑通过，9 项测试全部通过。

## 阶段 3 后台页面第一轮记录

已完成：

- 在现有“小程序运营”后台中新增“工作坊配置”页签。
- 超级管理员可在页面查看和录入：
  - 自助玩体验点
  - 自助玩材料包
  - 首页 Banner
  - 首页栏目内容
- 超级管理员和子管理员可在页面查看和录入权限范围内的：
  - 陪你玩创作者项目
  - 创作者联系入口
- 页面继续沿用原后台风格、Tab、表格和弹窗编辑方式，没有新增独立后台系统。

权限保留：

- 子管理员页面不展示体验点、材料包、首页 Banner、首页栏目管理区。
- 子管理员提交全局管理接口仍返回拒绝。
- 下载/导出仍只保留给超级管理员。

待继续细化：

- 体验点图片上传和营业时间编辑。
- 材料包图片、教程步骤和安全说明细化。
- 体验点与材料包库存关系的后台可视化维护。
- 陪你玩项目可约日期排期编辑。
- 企业微信二维码/联系我图片上传。
- 首页栏目内容的搜索选择器，避免手填内容 ID。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 首次因本机端口权限失败；开启本地网络权限后重跑通过，9 项测试全部通过。

## 阶段 3 运营数据闭环第一轮记录

已完成：

- 新增体验点营业时间接口：`/api/admin/workshop/venue-hour`。
- 新增陪你玩项目可约日期接口：`/api/admin/workshop/project-schedule`。
- 复用体验点材料包库存接口：`/api/admin/workshop/venue-kit`，并接入后台页面操作。
- 工作坊概览现在返回：
  - 体验点营业时间
  - 体验点材料包库存
  - 陪你玩项目可约日期
- 后台“工作坊配置”页签现在可以：
  - 给体验点添加营业时间
  - 给材料包配置体验点库存和到店积分
  - 给陪你玩项目添加可约日期和名额

权限保留：

- 体验点营业时间和材料包库存仍只允许超级管理员维护。
- 陪你玩项目可约日期允许超级管理员和对应范围内子管理员维护。
- 子管理员不能越权维护其他子管理员范围内的创作者项目。
- 下载/导出仍只保留给超级管理员。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 首次因本机端口权限失败；开启本地网络权限后重跑通过，9 项测试全部通过。

## 阶段 3 工作坊图片上传第一轮记录

已完成：

- 新增统一工作坊图片上传接口：`/api/admin/workshop/image`。
- 支持上传并压缩：
  - 体验点封面
  - 材料包封面
  - 陪你玩项目封面
  - 首页 Banner 图片
  - 创作者联系入口二维码
- 后台“工作坊配置”编辑弹窗已接入图片选择和保存后上传。

权限保留：

- 体验点、材料包、首页 Banner 图片仅超级管理员可上传。
- 陪你玩项目封面和联系入口二维码允许超级管理员和对应范围内子管理员上传。
- 子管理员不能越权上传其他创作者项目或全局运营图片。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，9 项测试全部通过。

## 阶段 4 前台读取接口第一轮记录

已完成：

- 新增小程序首页读取接口：`/api/mini/workshop/home`。
  - 返回小程序基础设置、首页 Banner、四个身份入口、四个运营栏目、自助玩预览、陪你玩预览。
- 新增自助玩读取接口：`/api/mini/workshop/self-play`。
  - 支持按城市、商圈筛选体验点、营业时间、材料包库存。
- 新增陪你玩读取接口：`/api/mini/workshop/companion`。
  - 支持按城市、地区、日期、用户场景筛选项目。
  - 在线创作者排序靠前。

当前说明：

- 这一轮完成的是前台数据接口，不是小程序页面替换。
- 小程序页面后续应从旧活动推荐接口逐步切换到这三个正式接口。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，9 项测试全部通过。

## 阶段 4 小程序页面第一轮记录

已完成：

- 首页改为“奇灯兴趣试玩工坊”正式结构：
  - 城市/地区入口
  - 首页 Banner
  - 自助玩 / 陪你玩切换
  - 四个身份入口：带孩子玩、和朋友玩、自己放空、定制礼物
  - 四个运营栏目：限时限量、今日上新、首发尝鲜、好评精选
  - 自助玩预览
  - 陪你玩预览
- 新增自助玩页面：`pages/self-play/self-play`。
  - 读取 `/api/mini/workshop/self-play`
  - 展示体验点、材料包库存和到店积分
- 新增陪你玩页面：`pages/companion/companion`。
  - 读取 `/api/mini/workshop/companion`
  - 支持日期筛选
  - 展示一句话体验、创作者、在线状态
- 小程序页面列表已注册新增页面。

当前说明：

- 旧 `draw/loading/reveal/activity` 页面暂未删除，用于保留旧能力与回滚余地。
- 下一步应继续补材料包详情、体验点详情、创作者项目详情和“现在咨询”入口。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，9 项测试全部通过。

## 阶段 4 前台详情闭环第一轮记录

已完成：

- 新增公开详情接口：
  - 体验点详情：`/api/mini/workshop/venues/[id]`
  - 材料包详情：`/api/mini/workshop/kits/[id]`
  - 陪你玩项目详情：`/api/mini/workshop/projects/[id]`
- 首页 Banner、运营栏目、自助玩预览、陪你玩预览已支持点击进入对应详情。
- 自助玩页面新增商圈筛选和体验点入口。
- 陪你玩页面新增日期、地区、身份场景筛选，项目卡片继续以“一句话体验”优先展示。
- 新增小程序页面：
  - `pages/venue-detail/venue-detail`
  - `pages/kit-detail/kit-detail`
  - `pages/project-detail/project-detail`
- 陪你玩项目详情支持：
  - 项目一句话介绍、创作者、在线状态、日期、地点、标签展示
  - 企业微信/微信等联系入口复制
  - 小程序内“现在咨询”兜底

数据与权限保留：

- 新增 `consultation_threads.workshop_project_id`，用于把新“陪你玩”项目咨询和旧活动咨询区分开。
- 旧活动咨询继续可用。
- 新项目咨询会关联正确创作者，并累加项目咨询数。
- 超级管理员/子管理员权限边界未放宽；子管理员仍不具备下载/导出权限。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，9 项测试全部通过。

## 阶段 4 创作者在线状态第一轮记录

已完成：

- 工作坊创作者在线状态收敛为两态：在线 / 离线。
- 移除“忙碌”作为工作坊在线状态选项；历史异常状态会按离线处理。
- 创作者小程序“我的”页新增在线状态开关。
- 创作者可填写或修改回复提示，例如“通常 10 分钟内回复”。
- 新增创作者本人在线状态接口：`/api/mini/creator/presence`。
- 管理员后台陪你玩项目列表只展示在线 / 离线。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，10 项测试全部通过。

## 阶段 5 上线就绪第一轮记录

已完成：

- 后台工作坊编辑弹窗将手填 ID 改为内容选择：
  - 体验点营业时间选择体验点
  - 材料包库存选择体验点和材料包
  - 项目可约日期选择陪你玩项目
  - 联系入口可选择关联项目
  - Banner 链接可选择材料包、体验点或项目
  - 首页栏目可选择材料包、体验点或项目
- 新增工程内上线状态板：`LAUNCH_READINESS.md`。
- 同步生产部署命名为 `qideng-workshop-platform`：
  - `.env.example`
  - `deploy/README.md`
  - `deploy/qideng.service`
  - `deploy/qideng-backup`
  - `deploy/nginx.conf`
  - `deploy/nginx-bootstrap.conf`
- 上线总控产品清单已同步当前正式工程状态，并统一“在线 / 离线”口径。
- 自动测试补强：
  - 首页 Banner 和栏目会生成正确小程序跳转路径。
  - 异常 `busy` 在线状态会降级为离线。
  - 降级后前台陪你玩接口只返回在线 / 离线。

检查结果：

- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，10 项测试全部通过。

## 阶段 5 上线收口第二轮记录

已完成：

- 正式小程序入口从 `app.json` 移除旧 `draw/loading/reveal/activity/share` 页面。
- 旧页面文件继续保留为未注册兼容文件，并将旧文案/旧跳转改为新玩法口径。
- 小程序“我的咨询”空状态改为“看到喜欢的项目后，可以直接咨询创作者。”
- 后台活动提示去掉“翻到”等旧逻辑，改为“不会在前台展示”。
- 新增上线体检脚本 `scripts/launch-check.mjs` 和命令 `npm run check:launch`：
  - 检查旧页面未注册。
  - 检查已注册页面文件完整。
  - 检查正式运行时代码无禁用文案。
  - 检查部署命名和环境变量样例。
- 旧全量测试中的固定活动日期改为动态未来日期，避免日期过期造成误报。

检查结果：

- `npm run check:launch` 通过。
- `npm run lint` 通过。
- `npm run build` 通过。
- `npm run test:mini` 通过，10 项测试全部通过。
- `npm run test` 通过，39 项测试全部通过。

## 阶段 5 上线收口第三轮记录

已完成：

- 发布版本从迁移临时版本统一为 `0.17.0-workshop`。
- `/version` 健康检查项目名从旧“奇灯 AI 智能体”改为“奇灯兴趣试玩工坊”。
- 上线体检新增版本路由校验，防止健康检查再次混入旧项目名。
- 新增 `scripts/check-production-env.mjs` 和命令 `npm run check:env`：
  - 检查生产环境变量是否缺失或仍是占位值。
  - 检查 `MINI_AUTH_MOCK=false`。
  - 检查后台登录变量使用 `ADMIN_USERNAME/ADMIN_PASSWORD`。
- 新增 `scripts/check-tencent-map-key.mjs` 和命令 `npm run check:tencent-map`：
  - 用腾讯地图 WebService 逆地址解析验证 `TENCENT_MAP_KEY`。
- `.env.example` 和部署文档移除不被代码读取的 `ADMIN_PASSWORD_HASH/ADMIN_PASSWORD_SALT`，改用 `ADMIN_USERNAME/ADMIN_PASSWORD`。
- Safari 中已确认腾讯位置服务账号登录，用户已创建应用；Key 仍需从 Safari 页面复制出来后验证。

检查结果：

- `npm run check:launch` 通过。
- `npm run build` 通过。
- 本地生产发布冒烟 `tests/release-smoke.mjs` 通过，返回版本 `0.17.0-workshop`。
- `npm run lint` 通过。
- `npm run test` 通过，39 项测试全部通过。
