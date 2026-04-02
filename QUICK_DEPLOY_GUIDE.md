# BrickPush游戏 - 快速部署指南

## 一键部署命令

### 第一步：登录CloudStudio
1. 访问 https://studio.cloud.tencent.com
2. 微信扫码登录
3. 创建"Node.js"工作空间

### 第二步：在CloudStudio中执行

```bash
# 1. 克隆项目（如果没有git仓库，先手动上传文件）
git clone https://github.com/YOUR_USERNAME/brickpush.git || echo "手动上传文件"

# 2. 进入项目
cd brickpush

# 3. 安装依赖
npm install

# 4. 构建项目
npm run build

# 5. 启动服务器
npm run start:server
```

### 第三步：分享游戏
1. CloudStudio会自动生成外部访问URL
2. 复制URL分享给朋友
3. 朋友打开链接即可玩游戏

---

## 服务器管理

### 启动游戏服务器
```bash
npm run start:server
```
- 服务器启动在端口8080
- 访问地址：CloudStudio提供的URL + 游戏路径

### 停止服务器
```bash
# 在运行服务器的终端中按：
Ctrl + C
```

### 重启服务器
```bash
# 1. 先停止（Ctrl + C）
# 2. 再启动
npm run start:server
```

---

## 更新游戏

### 本地更新后部署
```bash
# 在CloudStudio中执行：
git pull          # 如果使用Git
npm run build     # 重新构建
npm run start:server  # 重启服务器
```

### 手动更新
1. 在本地修改代码
2. 将整个项目文件夹上传到CloudStudio
3. 执行构建和启动命令

---

## 测试游戏

### 快速测试
```bash
# 检查服务器是否运行
curl http://localhost:8080/health

# 应该返回：{"ok":true}
```

### 游戏功能测试
1. 打开CloudStudio提供的URL
2. 测试：
   - ✅ 开始游戏按钮
   - ✅ 推动方块
   - ✅ 压死敌人
   - ✅ 心心方块连接过关
   - ✅ 下一关功能
   - ✅ 排行榜提交

---

## 故障排除

### 服务器无法启动
```bash
# 检查错误
npm run build --verbose

# 检查端口占用
lsof -i :8080

# 如果端口被占用，修改server.mjs中的端口号
```

### 游戏无法访问
- 确保CloudStudio工作空间在运行
- 检查终端是否有错误信息
- 尝试清除浏览器缓存

---

## 常用命令总结

```bash
# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 生产服务器
npm run start:server

# 检查状态
curl http://localhost:8080/health
```

---

**提示**：CloudStudio提供24小时免费运行时间，适合分享给朋友临时玩耍。如需长期运行，可考虑升级套餐。

**游戏URL**：CloudStudio工作空间预览URL