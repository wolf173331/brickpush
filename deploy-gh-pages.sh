#!/bin/bash

# BrickPush游戏 - GitHub Pages一键部署脚本
# 使用方法：./deploy-gh-pages.sh

echo "🎮 BrickPush游戏 - GitHub Pages部署脚本"
echo "======================================="

# 检查是否在项目目录
if [ ! -f "package.json" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查Git仓库
if [ ! -d ".git" ]; then
    echo "❌ 错误：当前目录不是Git仓库"
    echo "请先初始化Git仓库："
    echo "  git init"
    echo "  git add ."
    echo "  git commit -m 'Initial commit'"
    exit 1
fi

# 检查远程仓库
if ! git remote | grep -q origin; then
    echo "⚠️  警告：未设置远程仓库"
    echo "请先添加远程仓库："
    echo "  git remote add origin https://github.com/YOUR_USERNAME/brickpush.git"
    read -p "是否继续？(y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "1. 🔨 构建项目..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ 构建失败，请检查错误信息"
    exit 1
fi

echo "✅ 构建完成"

echo ""
echo "2. 📁 准备部署文件..."

# 检查是否已存在docs文件夹
if [ -d "docs" ]; then
    echo "📂 删除旧的docs文件夹..."
    rm -rf docs
fi

# 将dist重命名为docs
mv dist docs

echo "✅ 文件准备完成"

echo ""
echo "3. 📝 检查vite配置..."

# 检查vite配置中的base设置
if [ -f "vite.config.js" ]; then
    if ! grep -q "base: '/brickpush/'" vite.config.js; then
        echo "⚠️  警告：vite.config.js中缺少base配置"
        echo "请确保添加：base: '/brickpush/'"
    fi
elif [ -f "vite.config.ts" ]; then
    if ! grep -q "base: '/brickpush/'" vite.config.ts; then
        echo "⚠️  警告：vite.config.ts中缺少base配置"
        echo "请确保添加：base: '/brickpush/'"
    fi
fi

echo ""
echo "4. 📤 提交到GitHub..."

# 添加docs文件夹
git add docs/

# 提交
git commit -m "Deploy to GitHub Pages: $(date '+%Y-%m-%d %H:%M:%S')"

# 推送到GitHub
echo "🚀 推送到GitHub..."
git push

if [ $? -ne 0 ]; then
    echo "❌ 推送失败，请检查Git配置"
    exit 1
fi

echo ""
echo "🎉 部署完成！"
echo ""
echo "📋 后续步骤："
echo "1. 访问你的GitHub仓库：https://github.com/YOUR_USERNAME/brickpush"
echo "2. 点击 Settings → Pages"
echo "3. 设置 Source: Deploy from a branch"
echo "4. 设置 Branch: main, Folder: /docs"
echo "5. 点击 Save"
echo ""
echo "🌐 游戏将在几分钟后可用："
echo "   https://YOUR_USERNAME.github.io/brickpush"
echo ""
echo "🔧 故障排除："
echo "   - 如果页面空白，检查vite.config中的base配置"
echo "   - 如果404错误，确保GitHub Pages设置正确"
echo "   - 清除浏览器缓存后重试"
echo ""
echo "🔄 更新游戏："
echo "   修改代码后，重新运行此脚本即可"
echo ""
echo "🎮 祝您游戏愉快！"