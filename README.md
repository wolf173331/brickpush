# 把心串串 (Heart Kabab)

一款 H5 推箱子游戏，基于 Pixi.js + TypeScript 构建。将三个心心方块推到一起即可通关。

> 详细修改记录见 [CHANGELOG.md](./CHANGELOG.md)

## 游戏玩法

- **移动**：WASD 或方向键（移动端显示虚拟摇杆）
- **目标**：将地图上的 3 个心心方块推到相邻位置连成一线
- **方块**：推动方块到边缘会碎裂得分；炸弹推出后会爆炸
- **敌人**：碰到敌人扣血，HP 归零或时间耗尽则失败
- **通关**：心心连接后进入下一关，目前共 15 关
- **排行榜**：得分数据会上传到真正的排行榜,跟真人比拼
- 
---
## 目录结构

```
brickpush/
├── src/
│   ├── main.ts              # 入口
│   ├── MyGame.ts            # 游戏主类
│   ├── audio.ts             # 音效（Web Audio API）
│   ├── gameProgress.ts      # 分数/HP/排行榜
│   ├── supabaseClient.ts    # Supabase 在线排行榜
│   ├── constants/
│   │   ├── index.ts         # 游戏常量与关卡加载
│   │   └── levels.json      # 关卡数据（源码版，不参与运行时）
│   ├── scenes/
│   │   ├── MenuScene.ts
│   │   ├── GameScene.ts
│   │   ├── GameOverScene.ts
│   │   └── LeaderboardScene.ts
│   ├── components/
│   ├── prefabs/
│   └── systems/
├── public/
│   └── assets/
│       ├── levels.json      # 运行时读取的关卡数据（游戏实际使用）
│       ├── svg/             # 游戏素材 SVG
│       └── png/             # 游戏素材 PNG
├── docs/                    # GitHub Pages 部署目录（构建产物）
├── level-editor.html        # 关卡编辑器
├── index.html               # 游戏入口 HTML
├── vite.config.ts
├── tsconfig.json
└── package.json
```

> ⚠️ 关卡数据有两份：
> - `src/constants/levels.json` — 源码备份，不参与运行时
> - `public/assets/levels.json` — 游戏实际读取的文件，编辑器保存到这里

---

## 环境要求

- Node.js >= 20.18.0
- npm >= 10

---

## 安装依赖

```bash
npm install
```

---

## 本地开发

```bash
npx vite
```

启动后访问：
- 游戏：`http://localhost:3000/brickpush/`
- 关卡编辑器：`http://localhost:3000/level-editor.html`

> 端口被占用时自动切换到 3001。

---

## 关卡编辑器使用

1. 打开 `http://localhost:3000/level-editor.html`
2. 编辑器自动加载 `public/assets/levels.json`
3. 点击 **📂 打开文件** → 选择 `public/assets/levels.json`（绑定写入权限）
4. 编辑关卡地图
5. 按 **Ctrl+S** 或点 **💾 保存** 直接覆盖文件
6. 刷新游戏页面即可看到最新关卡

**地块快捷键：**

| 键 | 地块 |
|---|---|
| `0` | 空地 |
| `1` | 墙 |
| `2` | 方块 |
| `4` | 心心 |
| `5` | 炸弹 |
| `6` | 道具 |

**其他快捷键：** `Ctrl+Z` 撤销 · `Ctrl+Y` 重做 · 滚轮缩放

---

## Supabase 在线排行榜配置

复制 `.env.example` 为 `.env.local`，填入你的 Supabase 项目信息：

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

在 Supabase SQL 编辑器中建表：

```sql
CREATE TABLE leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
```

未配置时自动降级为本地 localStorage 排行榜。

---

## 构建发布

```bash
npm run build
```

产物输出到 `dist/`。

---

## 部署到 GitHub Pages

项目使用 `docs/` 目录作为 GitHub Pages 的发布源。

**步骤：**

1. 修改 `vite.config.ts`，将 `outDir` 改为 `docs`：

```ts
build: {
  outDir: 'docs',
  ...
}
```

2. 构建：

```bash
npm run build
```

3. 提交并推送：

```bash
git add docs/
git commit -m "deploy: update GitHub Pages"
git push origin main
```

4. 在 GitHub 仓库 → Settings → Pages → Source 选择 `main` 分支 `/docs` 目录，保存。

游戏地址：`https://你的用户名.github.io/brickpush/`

---

## 提交代码到 GitHub

日常开发提交：

```bash
git add .
git commit -m "你的描述"
git push origin main
```

同时更新游戏（构建 + 提交）：

```bash
npm run build
git add .
git commit -m "feat: 你的描述"
git push origin main
```

> `.env.local` 已在 `.gitignore` 中，Supabase 密钥不会被提交。

---

