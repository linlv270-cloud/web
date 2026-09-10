# 奇灯 new1.1 上线准备清单

更新时间：2026年8月26日

## 版本边界

- 当前上线候选：`new1.1-direct-contact`，应用版本 `1.1.0-new1`，发布标识 `20260826.new1.1-direct-contact`。
- 微信小程序 AppID：`wx65f33265254f8b02`。
- 本候选版从冻结的 `new1.0` 生产版本派生，仅调整消费者联系链路及对应的运营、隐私和上线配置。
- `08232330v1 / 0.28.2-forest` 与冻结目录 `qideng-workshop-platform-new1.0-production-frozen-20260824` 是受保护回退版本，不得修改或覆盖。

## 当前产品边界

- 消费者端固定为“发现 / 自在 / 结伴 / 我的”，不提供用户分享、预约、下单、支付、库存、积分、券或自建聊天。
- 结伴体验由新遇官单独授权公开注册手机号。已登录消费者点击“联系新遇官”后才可查看、复制或拨打号码，并看到“您好，我是通过奇灯小程序发现您的”提醒。
- 消费者查看事件按账号、项目和时间记录并限频；公开详情只返回掩码号码，不返回完整手机号或企业微信客服联系入口。
- 新遇官可在“我的 → 消费者联系”开启或关闭手机号公开授权；历史申请默认未授权。未授权时体验不能发布。
- 企业微信仅用于平台向已绑定成员发送内部通知，不创建消费者客服账号，不生成客服链接，也不接入消费者与新遇官的沟通。
- 短信验证与短信通知保持关闭；平台通知使用站内信，并可向已绑定成员发送企业微信应用提醒。
- 当前版本使用手动省市选择；腾讯地图 Key 不是首发上线依赖。

## 上线门禁

每次候选包必须依次通过：

```bash
npm run check:all
npm test
npm run release:source
npm run check:release-package
```

还必须完成：

1. 在旧数据库副本上执行初始化迁移，确认 `PRAGMA integrity_check` 为 `ok`。
2. 确认 `creator_applications.phone_public_authorized`、`phone_consent_at` 和 `phone_contact_view_events` 存在，历史申请仍为未授权。
3. 确认所有消费者公开接口不返回完整手机号、`open_kfid`、企业微信客服链接或旧联系渠道。
4. 用 CI 私钥路径生成微信临时预览二维码；不得显示、复制、归档或上传私钥，不得提前设为体验版或发布。
5. 在手机真机核对登录、四栏导航、城市筛选、详情、手机号授权与查看、复制和拨号、相册、裁切及固定表头底栏。
6. 从最终只读快照生成发布包和微信上传，不得从开发目录上传。

## 生产环境

本次 TDE 统一服务使用 `/opt/tde/backend/.env.production.local`，由服务器安全注入；部署脚本不得覆盖该文件：

```dotenv
DATA_DIR=/opt/tde/data
PUBLIC_SITE_URL=https://tde.thedesignexpo.org.cn
WECHAT_MINI_APP_ID=wx65f33265254f8b02
WECHAT_MINI_APP_SECRET=SET_ON_SERVER_ONLY
MINI_AUTH_MOCK=false
TENCENT_MAP_KEY=
TENCENT_MAP_REQUIRED=false
SMS_ENABLED=false
ALIYUN_SMS_ACCESS_KEY_ID=
ALIYUN_SMS_ACCESS_KEY_SECRET=
SMS_VERIFICATION_SIGN_NAME=
SMS_VERIFICATION_TEMPLATE_CODE=
WECOM_CORP_ID=SET_ON_SERVER_ONLY
WECOM_DIRECTORY_SECRET=SET_ON_SERVER_ONLY
WECOM_APP_AGENT_ID=SET_ON_SERVER_ONLY
WECOM_APP_SECRET=SET_ON_SERVER_ONLY
ADMIN_USERNAME=SET_ON_SERVER_ONLY
ADMIN_PASSWORD=SET_ON_SERVER_ONLY
```

本次不迁移旧 `3125` 服务、不修改 `admin.thedesignexpo.org.cn`、不整体迁移小程序，不把 `MINI_PROGRAM_API_BASE` 改成 TDE 域名。生产切换前必须备份 backend（含 standalone）、frontend、SQLite 主库及 `-wal/-shm`、上传目录、Nginx 配置、PM2 dump 和环境文件；回归失败时恢复时间戳备份，不修改回退版本源码。

## 微信平台核对

- 微信认证名称与主体资质有效。
- 小程序备案状态为“已通过”后才能完成正式发布。
- 用户隐私保护指引与小程序内 `privacy-v2` 一致，明确注册手机号的单独授权、查看记录和直接联系用途。
- 小程序 request、uploadFile、downloadFile 仍使用旧服务线的 `https://api.thedesignexpo.org.cn`；这不是本次 TDE 统一服务部署入口，不得改为 `tde.thedesignexpo.org.cn`。
- 服务类目、内容安全、用户生成内容声明和隐私接口声明与实际功能一致。
- 正式代码审核必须使用最终只读快照，版本说明为“new1.1 注册手机号直联与上线收口”。

## 法律文本

- 运营主体：行济诚生（北京）文化传播有限公司。
- 注册地址：北京市顺义区杨镇地区格吉路7-342号。
- 个人信息联系邮箱：kevin091120@126.com。
- 小程序内协议与 `docs/privacy-policy-draft-2026-08-22.md`、`docs/creator-service-agreement-draft-2026-08-22.md` 已统一为 `privacy-v2` 和 `creator-application-v2`。

## 正式发布顺序

1. 完成本地全量门禁、数据库迁移演练和手机临时预览。
2. 备份并部署 TDE 统一服务 `3001`，回归运营台、可视化平台、权限和既有数据。
3. 建立最终只读快照，核对 AppID、文件指纹、版本号和发布说明。
4. 小程序仍按原 `3125` 服务线单独管理，不随本次 TDE 服务发布。
