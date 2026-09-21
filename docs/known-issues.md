# 已知问题

## 小程序真机 TLS 连接失败（2026-09-21）

状态：暂缓排查，待后续复现时继续。

### 现象

- 微信开发者工具/真机调试 Console 中，小程序 `wx.request` 曾报：
  `request:fail net::ERR_CONNECTION_RESET`。
- 小程序进入房间时也曾出现 `TLS handshake failed`。
- PC 浏览器和部分微信开发者工具请求可以正常访问。

### 已确认

- ECS 上 `nginx -t` 通过，且已执行 `systemctl reload nginx`。
- 当前 Nginx 使用 TLS 1.2，证书为 RSA，密码套件包含：
  `ECDHE-RSA-AES128-GCM-SHA256`、`ECDHE-RSA-AES256-GCM-SHA384`。
- 服务端曾记录：
  - `GET /?__wx_tls_probe=... 200`：HTTPS 探针成功；
  - `GET /414-ws HTTP/1.1 101`：WebSocket 升级成功。
- 但真机仍曾出现连接重置，成功请求与失败请求的来源/调试链路尚未完全对应。

### 待排查

1. 用真机重新测试时，让管理员同时观察带 `__wx_tls_probe` 的精确请求。
2. 在 ECS 本机执行指定 TLS 1.2 的 `openssl s_client` 测试。
3. 必要时用 `tcpdump -ni any -s0 -vv 'tcp port 443'` 判断 ClientHello 是否到达 ECS。
4. 对比普通内测码、真机调试和 PC 模拟器三种链路。

### 当前决策

暂不继续修改 Nginx TLS 参数；先转向 H5 网页端适配。该问题尚未创建 Jira 单：当前本地 Jira 运行时缺少项目 Key 配置，后续补充项目 Key 后再正式建单。
