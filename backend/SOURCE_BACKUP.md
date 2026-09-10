# TDE 统一服务源码发布备份

- Project: TDE unified service
- Working version: new1.0 / 1.0.0-new1
- Frozen rollback version: 08232330v1 / 0.28.2-forest
- Release baseline: 20260824
- Production admin: https://tde.thedesignexpo.org.cn/admin/login
- Visualization: https://viz.thedesignexpo.org.cn/viz
- Internal service: 127.0.0.1:3001
- Production layout: /opt/tde/backend, /opt/tde/frontend, /opt/tde/data
- Runtime: Node.js 22.13 or newer

The frozen rollback source is not modified by new1.0 work. This copy keeps the
same business architecture while applying the separately reviewed UI, VI,
terminology, form layout, and confirmed matching-rule changes.

## Restore

```bash
npm ci
npm run check:all
npm test
npm run dev
```

Copy `.env.example` to `.env.local` and provide deployment-specific secrets before starting integrations. Production databases, uploaded user files, API keys, passwords, build output, and dependency caches are intentionally excluded from this source backup. The old 3125 service and the mini-program deployment line are outside this release.

## v0.28.0-forest scope

- 首页、本周精选、自助玩、陪你玩和“我的”统一为森林雕刻感 VI，并通过固定字阶、四比五图片和页面安全边界门禁。
- 陪玩官企业微信绑定改为管理员一次同意自动接通：按手机号匹配成员、创建独立客服、分配本人接待并同步全部项目。
- 站内信永久留档，已绑定陪玩官同步收到企业微信应用提醒；平台通知不再发送短信。
- 重新绑定采用成功后切换策略，企微接口失败时保留原有客服入口并记录失败原因。

## v0.26.3-workshop scope

- 首页删除重复城市说明和推荐横线，“发现”与“本周精选”统一 Section 字阶，五个运营栏目改为统一图标筛选卡。
- 项目标签改为分类展开选择；不再暴露“前台匹配主品类”，所有审核通过且匹配城市、日期和项目状态的作品、客群、风格及体验形式标签共同参与发现。
- 项目图片优先，缺图时回退到申请代表图；Logo 只显示在陪玩官身份区。
- 运营标签草稿与正式提交分离，保存草稿不再触发完整规则校验；陪玩官“我的”只保留一个日期计划。
- 企业微信正式客服配置接入 6 条官方测试项目；小程序后台 CorpID 绑定完成后进行真机联调。
- 正式设计令牌、固定字阶和发布检查继续作为所有页面的强制门禁。

## v0.26.2-workshop scope

- Creator application forms are constrained to the device width in both the mobile preview and the real WeChat mini program.
- SMS verification now requires the server master switch, the operations-console business switch, valid provider credentials, an approved signature, and an approved template before it is exposed to users.
- Production environment checks reject disabled, placeholder, malformed, or mock SMS configuration.

## v0.26.1-workshop scope

- Consumer mini program uses the Soft-minimal / Content-first discovery flow with the fixed “发现 / 自助玩 / 陪你玩 / 我的” navigation.
- Creator applications, projects, images, schedules, notifications, operation-tag review, super-admin controls, and scoped subadmin controls remain connected to one data model.
- “今日上新” is derived from publication time; creators apply only for “首发尝鲜 / 限时限量”; “好评精选” remains super-admin only.
- The release contains its design-token source and all build checks, so it can be installed and built without sibling workspace directories.
- WeChat, Enterprise WeChat, Tencent Location Service, SMS, and production server secrets remain external deployment configuration.

## v0.12.3 scope

- “保存更新 -> 已保存更新 -> 再写一篇”分流流程。
- 公开活动计划文案、第一人称文章、450至500字硬限制和结尾话题标签。
- 趋势词库自动轮动与上海时区每周更新判断。
- 魔法生成外部模型3.5秒超时、3.7秒任务兜底和第4秒强制收束，确保用户端6秒内可见结果。

## v0.12.4 scope

- 移动端文章标题和正文允许任意位置断行，避免长中文内容在窄屏被裁切。

## v0.12.5 scope

- 工作台调整为“生成文章、更新、我的”三个顶层模块。
- 通知迁入“我的”，未读数量在“我的”导航显示红点，并保留逐条已读逻辑。
- 旧通知与旧更新链接自动映射到新页面，通知相关文字可在运营台修改。

## v0.13.0 scope

- 首页围绕“记住你、懂小红书、跟进趋势”重新组织，主入口统一为“生成”。
- 新用户首次进入显示一次可后台管理的创作说明，关闭后保留可再次展开的小黄灯。
- 每次生成前强制确认活动计划，并分别提示未来计划、过期计划和近期无计划。
- 新用户基础生成和魔法生成额度各3次；个人邀请码每成功邀请一位新用户，邀请人两种额度各增加2次并收到站内通知。

## v0.13.1 scope

- 首页、活动计划、标签、登录、生成等待与邀请文案统一为用户可理解的产品表达。
- 首页优势更新为“记住你、懂小红书、热搜算法”，创作说明明确不承诺爆文。
- 用户名、微信号、社交账号和品牌标识等废弃字段规则统一停用。
- 工作台常用加载、保存、上传和复制提示纳入运营台文字管理。

## v0.14.0 scope

- 母品牌统一为“奇灯”，同一账号新增“生成文章”和“寻找合作”两个入口，共享图片、城市、活动计划、标签和品牌介绍。
- 用户可主动登记13类合作意向，只有明确授权后才进入平台合作匹配。
- 新增子管理员手机号申请、超级管理员审核、固定邀请码、受限用户管理、分级与内部备注。
- 子管理员只能维护自己邀请关系树内的用户，不能发送通知、调整额度、修改平台设置或下载资料。
- 邀请码改为不暴露层级的短随机码，数据库永久保存真实邀请人、所属子管理员及后续分享继承关系。
- 新增超级管理员用户资源看板与邀请关系树，支持按城市、日期、标签、分级、子管理员和合作意向组合查看。

## v0.14.1 scope

- 子管理员新增用户后直接进入完整档案，可代用户上传代表图片并维护城市、活动日期、标签、品牌介绍、合作意向、分级和内部备注。
- 超级管理员拥有相同的全平台用户代填和维护能力。
- 用户列表明确区分用户自己的邀请码与注册时使用的邀请码。
- 用户移出列表采用可恢复归档，保留图片、标签、日期、文章及全部历史数据。

## v0.14.2 scope

- 修复注册页手机端合作选项的重叠与横向溢出。
- 手机端底部“生成、找合作、更新、我的”四项导航统一等宽显示。
- 注册时合作授权默认接受；合作页尚未设置时同样默认接受，仍允许用户主动取消。
- 删除合作页“暂时不接受合作匹配”按钮及对应的废弃后台文字配置。

## v0.15.0 scope

- 前台调整为不公开展示创意人的“奇灯私人创意档案”，首页只保留加入和登录入口。
- 注册采集邀请码、手机号确认、微信ID与常驻省市，初始密码为手机号；注册或登录后默认进入私人档案。
- 工作台统一为“档案、更新、生成、我的”四个一级入口，通知保留在“我的”。
- “更新”整合基本信息、单张裁切图片、一句话介绍、8类标签、活动计划、合作需求和2000字介绍。
- 新版首页、档案、更新及创作说明文字全部纳入运营台管理，资料字段继续支持必填、选填或停用。
- 保留两种文章生成、额度奖励、邀请码关系树、超级管理员、受限子管理员、通知、历史数据及回退能力。

## v0.15.1 scope

- 暂时关闭用户端“生成”一级入口和直接访问；生成实现、历史文章、额度、接口及后台文章生成管理全部保留，后续可重新开启。
