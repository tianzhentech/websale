# Pixel WebSale

独立 CDK 兑换前端，使用 `Next.js + Tailwind CSS`。
现在兑换逻辑已经迁到 Next 自带的 `app/api/*`，不再需要单独启动 `web.py` 代理。

## 开发

1. 确保主 Pixel API 已经在运行。

2. 安装并启动 Next 前端：

```bash
cd /Users/tianzhen/Documents/pixel/sale/websale
yarn install
yarn dev
```

如果 Yarn 提示缓存目录权限或可写性问题，可以临时这样装：

```bash
yarn install --cache-folder /tmp/pixel-yarn-cache
```

默认情况下，Next 的 `app/api/*` 会继续去请求 `http://127.0.0.1:8006` 的主 Pixel API，因为仓库里的主 `web.py` 默认就是跑在 `127.0.0.1:8006`。

首页最上方还有一块 Markdown 说明区，内容保存在 `content/notice-board.md`。你也可以访问 `/admin` 在线编辑这块内容，并在同一个页面里覆盖 Next 服务端使用的后端 API 地址和后端鉴权密码。默认密码是 `123456`。

## 环境变量

- `PIXEL_ADMIN_PASSWORD`
  主后台和 WebSale 管理页共用的管理员密码；Next 服务端转发到主后端时也默认携带这个值，默认 `123456`
- `PIXEL_WEBSALE_API_BASE_URL`
  Next 服务端路由转发到主 Pixel API 的默认地址，默认 `http://127.0.0.1:8006`；`/admin` 页里保存的覆盖地址优先级更高
- `PIXEL_WEBSALE_SITE_TITLE`
  兑换站页面标题，默认 `Pixel CDK Exchange`
- `PIXEL_WEBSALE_ADMIN_PASSWORD`
  兼容旧配置的管理员密码别名；如果同时设置，会优先使用 `PIXEL_ADMIN_PASSWORD`
