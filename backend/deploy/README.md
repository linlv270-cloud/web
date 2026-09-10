# TDE 生产部署参考

本目录只描述 TDE 统一服务，不负责迁移旧 `3125` 服务或整体迁移小程序。

## 生产布局

- 服务：`127.0.0.1:3001`
- 后端：`/opt/tde/backend`
- 静态文件：`/opt/tde/frontend`
- 数据与上传：`/opt/tde/data`
- PM2 进程：`tde`
- 运营台：`https://tde.thedesignexpo.org.cn/admin/login`
- 可视化：`https://viz.thedesignexpo.org.cn/viz`

`3001` 是内部监听端口。`viz` 域名的 `/admin` 只代理同一个服务，属于兼容别名。

## 运行约束

1. 使用服务器已有 `/opt/tde/backend/.env.production.local`，发布脚本不得覆盖它。
2. 生产管理员密码只通过服务器环境变量注入，不写入代码、包、日志或聊天。
3. 小程序仍使用原有服务线；本次不得把 `MINI_PROGRAM_API_BASE` 改成 TDE 域名。
4. PM2 以 admin 用户管理 `tde`，启动参数为 `HOSTNAME=127.0.0.1`、`PORT=3001`。
5. 发布前必须备份 backend（含 standalone）、frontend、SQLite 主库及 `-wal/-shm`、uploads、Nginx 配置、PM2 dump 和 env 文件。
6. `sudo nginx -t` 通过后才允许 reload；不得直接重启或覆盖 Nginx。

## 发布顺序

先备份，再部署源码、安装依赖、构建 standalone、保持 classic 版本回归管理员登录、可视化登录、方案接口、权限范围、筛选、创建/发布/下线和 published 可见性。数据库迁移需在隔离副本上重复执行并通过完整性检查，端到端回归后才考虑 planning 版本。

## 回滚

代码问题恢复对应时间戳备份的 backend、standalone、frontend、Nginx 和 PM2 dump；数据问题使用发布前 SQLite 主库备份，并同时核对 `-wal/-shm`。不删除新版表、方案数据或上传文件。
