# 分享游戏

当前最稳妥的分享方式是保留本地 `server.mjs`，再用 SSH 隧道把 `8080` 端口映射成一个公网地址。

## 一键重新分享

```bash
./share-game.sh
```

脚本会自动：

- 切到 Node `24.14.1`
- 确保本地游戏服务器已运行
- 启动 `localhost.run` 隧道
- 输出可直接发给朋友的 `https://...` 地址

## Cloudflare 备用链接

```bash
./share-game-cloudflare.sh
```

这个脚本会启动 `cloudflared` Quick Tunnel，并把最新地址写到 `.share-cloudflare-url.txt`。

## 相关文件

- 服务端日志：`.share-server.log`
- 隧道日志：`.share-tunnel.log`
- 最近一次分享链接：`.share-url.txt`
- Cloudflare 隧道日志：`.share-cloudflare.log`
- 最近一次 Cloudflare 链接：`.share-cloudflare-url.txt`

## 注意

- 这是临时公网链接，断线后重新执行 `./share-game.sh` 会得到新地址
- 排行榜数据保存在 `data/leaderboard.json`
- 只要本地 `server.mjs` 和 SSH 隧道进程不退出，朋友就能继续访问
