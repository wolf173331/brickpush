#!/bin/bash

echo "=== Brick Push Game 启动脚本 ==="

# 加载nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 使用Node.js 24.14.1
echo "切换到Node.js 24.14.1..."
nvm use 24.14.1

# 验证版本
echo "当前Node版本: $(node --version)"
echo "当前npm版本: $(npm --version)"

# 进入项目目录
cd "$(dirname "$0")"

# 检查依赖
if [ ! -d "node_modules" ]; then
    echo "安装依赖..."
    npm install
else
    echo "依赖已存在，跳过安装"
fi

# 启动游戏
echo "启动游戏开发服务器..."
echo "游戏将在 http://localhost:3000 可用"
echo "按 Ctrl+C 停止服务器"
echo ""
npm run dev