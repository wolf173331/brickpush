#!/bin/bash

# CloudStudio部署脚本
# 用于将BrickPush游戏部署到CloudStudio

echo "=== BrickPush游戏 CloudStudio部署脚本 ==="

# 检查是否已登录CloudStudio
echo "1. 确保你已登录CloudStudio"
echo "   - 打开 https://studio.cloud.tencent.com"
echo "   - 使用微信扫码登录"
echo "   - 创建或选择一个工作空间"

echo ""
echo "2. 在CloudStudio中打开终端，执行以下命令："
echo ""
echo "   # 克隆项目代码"
echo "   git clone https://github.com/YOUR_USERNAME/brickpush.git || git pull"
echo ""
echo "   # 进入项目目录"
echo "   cd brickpush"
echo ""
echo "   # 安装依赖"
echo "   npm install"
echo ""
echo "   # 构建项目"
echo "   npm run build"
echo ""
echo "   # 启动服务器"
echo "   npm run start:server"
echo ""
echo "3. 访问游戏："
echo "   - CloudStudio会提供一个预览URL"
echo "   - 通常是类似 https://xxxx.cloudstudio.net 的地址"
echo "   - 将这个URL分享给朋友即可"

echo ""
echo "4. 管理服务器："
echo "   - 启动服务器：npm run start:server"
echo "   - 停止服务器：按 Ctrl+C"
echo "   - 重启服务器：先停止，再启动"
echo ""
echo "5. 更新游戏："
echo "   - 在本地修改代码后，push到GitHub"
echo "   - 在CloudStudio中执行：git pull"
echo "   - 重新构建：npm run build"
echo "   - 重启服务器：按Ctrl+C，然后 npm run start:server"

echo ""
echo "=== 部署完成 ==="
echo "现在你可以将CloudStudio提供的预览URL分享给朋友了！"