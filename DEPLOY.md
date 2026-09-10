# TDE 统一服务上线说明

本次只部署 TDE 统一服务 `127.0.0.1:3001`：

- 后端：`/opt/tde/backend`
- 静态目录：`/opt/tde/frontend`
- 数据目录：`/opt/tde/data`
- PM2 进程：`tde`
- 运营台：[https://tde.thedesignexpo.org.cn/admin/login](https://tde.thedesignexpo.org.cn/admin/login)
- 可视化平台：[https://viz.thedesignexpo.org.cn/viz](https://viz.thedesignexpo.org.cn/viz)

`3001` 仅供服务器内部监听，不能作为用户访问链接。`viz` 的 `/admin` 只是同一套服务的兼容别名，不是第二套运营台。

## 服务边界

- 不迁移或修改旧 `3125` 服务。
- 不修改 `admin.thedesignexpo.org.cn`。
- 不整体迁移小程序，不创建第二套数据库、账号、标签或档期。
- 小程序原有 API 线路不得在本次脚本中改成 TDE 域名。

## 发布前

1. 从最终源码包部署，不上传 `.env`、密钥、数据库、上传目录或 `node_modules`。
2. 备份 `/opt/tde/backend`（包括当前 standalone）、`/opt/tde/frontend`、SQLite 主库及其 `-wal/-shm`、`/opt/tde/data/uploads`、`/etc/nginx/conf.d/tde.conf`、`/home/admin/.pm2/dump.pm2` 和当前 `/opt/tde/backend/.env.production.local`。
3. 人工核对环境文件；部署脚本不得重写或覆盖它。生产管理员密码只通过服务器环境变量安全注入。
4. 确认以下证书存在：
   `/etc/letsencrypt/live/tde.thedesignexpo.org.cn/`
   `/etc/letsencrypt/live/viz.thedesignexpo.org.cn/`
5. 运行 `sudo nginx -t` 通过后，才允许 reload。

## 构建与进程

在 `/opt/tde/backend` 使用 `npm ci` 和 `npm run build`。构建完成后由 PM2 以 `HOSTNAME=127.0.0.1`、`PORT=3001` 管理名为 `tde` 的 standalone 服务，并保存 PM2 dump。

不要使用会覆盖生产环境变量的旧部署脚本。`work/deploy-tde-update.sh` 必须通过 `TDE_UPDATE_ARCHIVE` 显式指定发布包，不能依赖固定历史文件。

## 回归顺序

先保持 classic 版本，依次验证管理员登录、可视化登录、方案接口、权限范围、既有风格筛选、数据库迁移重复执行、运营台创建/发布/下线方案，以及场地端只显示 published 方案。完成端到端回归后，才考虑 planning 版本。

生产凭据不写入代码、发布包、文档或聊天。`DEPLOY.md` 中不得使用旧示例账号。

## 回滚

代码问题：恢复对应时间戳备份中的 backend、standalone、frontend、Nginx 配置和 PM2 dump，验证配置后再重启或 reload。

数据问题：使用发布前 SQLite 备份，同时核对 `-wal/-shm`；不删除新版表、方案数据或上传文件。
