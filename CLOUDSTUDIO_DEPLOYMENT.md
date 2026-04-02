# BrickPush游戏 - CloudStudio 部署指南

## 概述

本文档介绍如何将BrickPush推箱子游戏部署到腾讯云CloudStudio，以便在国内服务器上运行并分享给朋友。

## 游戏特点

- 🎮 推箱子游戏，包含心心方块、炸弹、敌人等元素
- ❤️ 心心方块必须横竖连接才能过关
- 🏆 3点生命值系统，避免敌人攻击
- ⏰ 99秒倒计时，增加紧张感
- 🎯 3个不同关卡，逐步增加难度
- 📊 排行榜系统，记录玩家成绩

## 部署步骤

### 第一步：准备项目

1. **确保项目已构建**
   ```bash
   cd /Users/ludi/workspace/new\ work/brickpush
   npm run build
   ```

2. **验证构建结果**
   ```bash
   ls -la dist/
   ```
   应该看到 `index.html` 和 `assets/` 文件夹

### 第二步：登录CloudStudio

1. 访问 [https://studio.cloud.tencent.com](https://studio.cloud.tencent.com)
2. 使用微信扫码登录
3. 创建或选择一个工作空间（建议选择"Node.js"环境）

### 第三步：上传项目到CloudStudio

#### 方法A：使用Git（推荐）
1. 在CloudStudio中打开终端
2. 克隆项目：
   ```bash
   git clone https://github.com/YOUR_USERNAME/brickpush.git
   cd brickpush
   ```

#### 方法B：手动上传
1. 在CloudStudio中创建新项目
2. 将本地 `brickpush` 文件夹中的所有文件上传到CloudStudio工作空间
3. 可以使用CloudStudio的文件上传功能或命令行工具

### 第四步：安装依赖和构建

```bash
# 进入项目目录
cd brickpush

# 安装依赖
npm install

# 构建项目
npm run build

# 验证构建
ls -la dist/
```

### 第五步：启动游戏服务器

```bash
# 启动服务器
npm run start:server

# 或者使用开发模式
npm run dev
```

## 服务器管理命令

### 启动服务器
```bash
npm run start:server
```
- 服务器将在端口8080启动
- 日志显示：`BrickPush server running at http://127.0.0.1:8080`

### 停止服务器
- 在终端中按 `Ctrl+C`

### 重启服务器
1. 按 `Ctrl+C` 停止当前服务器
2. 重新执行：`npm run start:server`

### 检查服务器状态
```bash
curl http://localhost:8080/health
```
应该返回：`{"ok":true}`

## 访问和分享游戏

### 获取访问URL
1. CloudStudio会自动为你的工作空间生成一个外部访问URL
2. 通常格式为：`https://xxxx.cloudstudio.net`
3. 在CloudStudio界面上找到"预览"或"访问"按钮

### 分享游戏
1. 复制CloudStudio提供的URL
2. 分享给朋友，例如：
   - 微信：直接发送链接
   - QQ：发送链接
   - 其他社交媒体

### 测试游戏
1. 在浏览器中打开CloudStudio提供的URL
2. 点击"开始游戏"
3. 测试所有功能：
   - 推动方块
   - 压死敌人
   - 连接心心方块过关
   - 查看排行榜

## 维护和更新

### 更新游戏内容
1. **本地修改代码**
   ```bash
   # 在本地电脑上修改游戏代码
   ```

2. **更新到CloudStudio**
   ```bash
   # 如果使用Git
   git add .
   git commit -m "更新游戏"
   git push
   
   # 在CloudStudio中
   git pull
   npm run build
   ```

3. **重启服务器**
   ```bash
   # 停止当前服务器（Ctrl+C）
   # 启动新服务器
   npm run start:server
   ```

### 监控服务器状态
- 查看CloudStudio终端输出
- 检查游戏日志
- 监控服务器资源使用情况

## 故障排除

### 常见问题

#### 1. 服务器启动失败
```bash
# 检查端口是否被占用
netstat -tlnp | grep 8080

# 如果端口被占用，修改server.mjs中的端口号
# 然后重新启动
```

#### 2. 游戏无法访问
- 检查CloudStudio工作空间是否运行
- 确认服务器已启动：`npm run start:server`
- 检查网络连接

#### 3. 游戏功能异常
- 检查浏览器控制台是否有错误
- 验证项目构建是否正确
- 清除浏览器缓存后重试

#### 4. 依赖安装失败
```bash
# 清理node_modules重新安装
rm -rf node_modules package-lock.json
npm install
```

### 日志查看
```bash
# 查看服务器日志
tail -f 服务器日志文件路径

# 查看错误日志
grep -i error 日志文件路径
```

## 性能优化建议

### 服务器优化
1. **使用生产模式**
   ```bash
   npm run build
   npm run start:server
   ```

2. **启用Gzip压缩**
   - 在CloudStudio配置中启用
   - 或修改server.mjs添加压缩中间件

3. **设置缓存策略**
   - 静态文件设置适当缓存
   - 避免频繁重新加载

### 游戏优化
1. **减少资源大小**
   - 压缩图片和SVG文件
   - 合并小文件

2. **懒加载**
   - 按需加载游戏资源
   - 减少初始加载时间

## 安全注意事项

1. **保护服务器**
   - 定期更新依赖包
   - 监控异常访问
   - 设置访问限制

2. **数据安全**
   - 排行榜数据存储在本地文件
   - 定期备份数据

3. **访问控制**
   - CloudStudio提供基本访问控制
   - 可以设置密码保护

## 扩展功能

### 添加新功能
1. **添加新关卡**
   - 修改 `src/constants/levels.json`
   - 重新构建项目

2. **添加新道具**
   - 修改游戏逻辑
   - 添加新的SVG资源

3. **添加音效**
   - 添加音频文件
   - 修改游戏代码添加音效播放

### 自定义配置
1. **修改游戏设置**
   - 调整关卡难度
   - 修改时间限制
   - 调整生命值数量

2. **自定义UI**
   - 修改颜色主题
   - 调整界面布局
   - 添加自定义元素

## 联系和支持

### 获取帮助
- CloudStudio官方文档：https://cloudstudio.net/docs
- GitHub Issues：提交问题报告
- 开发者社区：寻求技术支持

### 反馈建议
- 游戏改进建议
- Bug报告
- 新功能请求

---

## 快速参考命令

```bash
# 完整部署流程
git clone https://github.com/YOUR_USERNAME/brickpush.git
cd brickpush
npm install
npm run build
npm run start:server

# 日常维护
git pull              # 更新代码
npm run build         # 重新构建
npm run start:server  # 启动服务器

# 故障排查
curl http://localhost:8080/health  # 检查服务器状态
ps aux | grep node                 # 查看Node进程
netstat -tlnp | grep 8080          # 检查端口占用
```

---

**部署完成时间**：2026年4月2日  
**游戏版本**：v1.0.0  
**部署状态**：✅ 可部署到CloudStudio

祝您游戏部署顺利，玩得开心！ 🎮