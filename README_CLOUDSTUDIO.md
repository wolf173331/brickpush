# 🎮 BrickPush 推箱子游戏 - CloudStudio 部署版

## 游戏简介
一款有趣的推箱子游戏，包含心心方块、炸弹、敌人等元素，需要策略性地推动方块来过关。

## 快速部署到CloudStudio

### 方法一：使用部署脚本
```bash
# 运行部署脚本
./deploy-to-cloudstudio.sh
```

### 方法二：手动部署
1. **登录CloudStudio**
   - 访问 https://studio.cloud.tencent.com
   - 微信扫码登录
   - 创建"Node.js"工作空间

2. **上传项目**
   - 将整个 `brickpush` 文件夹上传到CloudStudio

3. **安装和启动**
   ```bash
   # 进入项目目录
   cd brickpush
   
   # 安装依赖
   npm install
   
   # 构建游戏
   npm run build
   
   # 启动服务器
   npm run start:server
   ```

## 🚀 启动服务器
```bash
# 启动生产服务器（端口8080）
npm run start:server

# 或使用开发模式（热重载）
npm run dev
```

## 📡 访问游戏
- CloudStudio会自动生成外部访问URL
- 复制URL分享给朋友
- 朋友打开链接即可玩游戏

## 🔧 服务器管理

### 启动
```bash
npm run start:server
```

### 停止
```bash
# 在终端中按 Ctrl+C
```

### 重启
```bash
# 1. 停止服务器 (Ctrl+C)
# 2. 重新启动
npm run start:server
```

### 检查状态
```bash
curl http://localhost:8080/health
```

## 🔄 更新游戏
```bash
# 1. 停止当前服务器 (Ctrl+C)
# 2. 重新构建
npm run build
# 3. 重启服务器
npm run start:server
```

## 🎯 游戏特性
- ✅ 3个不同难度的关卡
- ✅ 心心方块必须连接才能过关
- ✅ 3点生命值系统
- ✅ 99秒倒计时
- ✅ 排行榜系统
- ✅ 响应式设计，支持手机和电脑

## 🐛 故障排除
- **服务器无法启动**：检查端口8080是否被占用
- **游戏无法访问**：确保CloudStudio工作空间在运行
- **功能异常**：清除浏览器缓存后重试

## 📚 详细文档
- 完整部署指南：[CLOUDSTUDIO_DEPLOYMENT.md](CLOUDSTUDIO_DEPLOYMENT.md)
- 快速部署指南：[QUICK_DEPLOY_GUIDE.md](QUICK_DEPLOY_GUIDE.md)

## 📞 支持
- CloudStudio官方文档：https://cloudstudio.net/docs
- 游戏问题反馈：提交GitHub Issues

---

**部署状态**：✅ 可部署到CloudStudio  
**游戏版本**：v1.0.0  
**最后更新**：2026年4月2日

祝你部署顺利，玩得开心！ 🎮