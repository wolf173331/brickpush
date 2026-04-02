# BrickPush游戏 - GitHub Pages 部署指南

## 🌟 概述

GitHub Pages是GitHub提供的免费静态网站托管服务，非常适合部署前端游戏。通过GitHub Pages，你可以：
- 🆓 完全免费使用
- 🌐 全球可访问
- 🔗 获得固定URL：`https://你的用户名.github.io/仓库名`
- ⚡️ 自动部署，更新方便

## 📋 部署前提

1. **GitHub账号**：如果没有，前往 https://github.com 注册
2. **Git客户端**：确保本地已安装Git
3. **Node.js环境**：用于构建项目

## 🚀 完整部署流程

### 步骤1：创建GitHub仓库

1. 登录GitHub
2. 点击右上角"+" → "New repository"
3. 填写仓库信息：
   - **Repository name**: `brickpush`（或其他名称）
   - **Description**: 推箱子游戏
   - **Public**: ✅ 选择公开（必须公开才能使用GitHub Pages）
   - **Initialize with README**: ✅ 勾选
4. 点击"Create repository"

### 步骤2：准备本地项目

```bash
# 1. 进入项目目录
cd "/Users/ludi/workspace/new work/brickpush"

# 2. 初始化Git仓库（如果还未初始化）
git init

# 3. 添加所有文件
git add .

# 4. 提交更改
git commit -m "Initial commit: BrickPush game"

# 5. 添加远程仓库
git remote add origin https://github.com/你的用户名/brickpush.git

# 6. 推送到GitHub
git branch -M main
git push -u origin main
```

### 步骤3：修改Vite配置

打开 `vite.config.js` 或 `vite.config.ts`，添加`base`配置：

```javascript
// vite.config.js 或 vite.config.ts
export default {
  base: '/brickpush/', // ⚠️ 重要：必须与仓库名一致
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
}
```

### 步骤4：构建项目

```bash
# 构建生产版本
npm run build

# 检查构建结果
ls -la dist/
# 应该看到 index.html 和 assets/ 文件夹
```

### 步骤5：配置GitHub Pages

1. 在GitHub仓库页面，点击 **Settings**
2. 左侧菜单选择 **Pages**
3. 在 **Source** 部分：
   - Branch: `main`
   - Folder: `/ (root)` 或 `/docs`（根据你的选择）
4. 点击 **Save**

### 步骤6：将构建结果推送到仓库

#### 方法A：使用根目录部署
```bash
# 1. 将dist文件夹内容复制到根目录
cp -r dist/* .

# 2. 提交更改
git add .
git commit -m "Deploy to GitHub Pages"
git push

# 3. 删除复制的文件（可选）
rm -rf assets/ index.html
```

#### 方法B：使用docs文件夹部署（推荐）
```bash
# 1. 将dist重命名为docs
mv dist docs

# 2. 修改vite配置中的outDir
# 将 outDir: 'dist' 改为 outDir: 'docs'

# 3. 重新构建
npm run build

# 4. 提交并推送
git add docs/
git commit -m "Deploy docs folder to GitHub Pages"
git push
```

### 步骤7：访问你的游戏

1. 等待几分钟让GitHub Pages构建完成
2. 访问：`https://你的用户名.github.io/brickpush`
3. 如果看到游戏，恭喜你！部署成功！

## 🔄 更新游戏

当你修改了游戏代码后，更新步骤：

```bash
# 1. 本地修改代码

# 2. 重新构建
npm run build

# 3. 提交更改
git add .
git commit -m "Update game: 描述修改内容"
git push

# 4. 等待GitHub Pages自动更新（约1-2分钟）
```

## 🔧 常见问题解决

### 问题1：页面空白，控制台报错404
**原因**：资源路径错误
**解决**：
1. 确保`vite.config.js`中的`base`配置正确
2. 检查`dist/index.html`中的资源引用路径
3. 清理浏览器缓存

### 问题2：GitHub Pages构建失败
**解决**：
1. 检查仓库Settings → Pages → Source设置
2. 确保选择的文件夹存在
3. 查看GitHub Actions日志中的错误信息

### 问题3：游戏功能异常
**解决**：
1. 检查浏览器控制台是否有JavaScript错误
2. 确保所有资源文件都已上传
3. 测试本地构建是否正常：`npm run build && npm run preview`

## 📁 项目结构建议

```
brickpush/
├── docs/                    # GitHub Pages部署文件夹
│   ├── index.html
│   └── assets/
├── src/                     # 源代码
├── package.json
├── vite.config.js          # 配置base: '/brickpush/'
├── README.md
└── .gitignore
```

## ⚙️ 高级配置

### 自定义域名
1. 购买域名（阿里云、腾讯云等）
2. 在GitHub Pages设置中添加自定义域名
3. 在域名服务商处配置DNS记录

### 启用HTTPS
- GitHub Pages自动提供HTTPS
- 无需额外配置

### 缓存策略
- GitHub Pages使用CDN，有良好的缓存
- 如需强制更新，可以修改文件名或添加查询参数

## 🎮 测试游戏

部署后，测试以下功能：
1. ✅ 开始游戏按钮
2. ✅ 推动方块
3. ✅ 压死敌人
4. ✅ 心心方块连接过关
5. ✅ 下一关功能
6. ✅ 排行榜提交

## 📊 监控访问

1. **GitHub Insights**：查看仓库访问统计
2. **Google Analytics**：添加GA代码到游戏
3. **控制台日志**：检查玩家遇到的问题

## 🔐 安全注意事项

1. **公开仓库**：GitHub Pages要求仓库必须公开
2. **敏感信息**：不要在代码中包含API密钥等敏感信息
3. **依赖安全**：定期更新npm包

## 🚀 一键部署脚本

创建 `deploy-gh-pages.sh`：

```bash
#!/bin/bash
echo "=== 部署到GitHub Pages ==="

# 构建项目
npm run build

# 将dist重命名为docs
mv dist docs

# 提交更改
git add docs/
git commit -m "Deploy to GitHub Pages: $(date)"
git push

echo "✅ 部署完成！"
echo "🌐 访问：https://你的用户名.github.io/brickpush"
```

给脚本添加执行权限：
```bash
chmod +x deploy-gh-pages.sh
```

## 📞 支持与帮助

- **GitHub Pages文档**：https://docs.github.com/pages
- **Vite部署指南**：https://vitejs.dev/guide/static-deploy
- **问题反馈**：在GitHub仓库创建Issue

---

## 🎯 快速参考命令

```bash
# 初始化部署
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/brickpush.git
git push -u origin main

# 修改配置后
npm run build
mv dist docs
git add docs/
git commit -m "Deploy to GitHub Pages"
git push

# 更新游戏
npm run build
git add .
git commit -m "Update game"
git push
```

---

**部署完成时间**：2026年4月2日  
**游戏版本**：v1.0.0  
**部署状态**：✅ 可部署到GitHub Pages  

祝您部署顺利，玩得开心！ 🎮