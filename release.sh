#!/bin/bash
# 一键构建 + 自动更新版本号 + 生成 changelog + 提交到 GitHub
# 用法: ./release.sh "修复了xxx问题，新增了yyy功能"
# 或者不带参数，脚本会提示输入

set -e
cd "$(dirname "$0")"

# ── 自动更新版本号（末尾数+1）────────────────────────────
echo "🔢 更新版本号..."

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "   当前版本: $CURRENT_VERSION"

# 解析版本号 MAJOR.MINOR.PATCH
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# PATCH + 1
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="${MAJOR}.${MINOR}.${NEW_PATCH}"

echo "   新版本: $NEW_VERSION"

# 更新 package.json
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('./package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('   ✅ package.json 已更新');
"

# ── 读取更新后的版本号 ──────────────────────────────────
VERSION=$NEW_VERSION
DATE=$(date '+%Y-%m-%d')

# ── 获取本次更新说明 ────────────────────────────────────
if [ -n "$1" ]; then
  MSG="$1"
else
  echo ""
  echo "📝 请输入本次更新内容（直接回车跳过）："
  read -r MSG
fi

if [ -z "$MSG" ]; then
  MSG="常规更新"
fi

echo ""
echo "📦 发布版本: v${VERSION}"
echo "📝 更新内容: ${MSG}"
echo ""

# ── 构建 ────────────────────────────────────────────────
echo "🔨 构建中..."
npm run build

echo "📁 更新 docs/ (GitHub Pages)..."
rm -rf docs
cp -r dist docs
cp public/assets/levels.json docs/assets/levels.json

# ── 更新 CHANGELOG.md ───────────────────────────────────
echo ""
echo "📋 更新 CHANGELOG.md..."

# 创建临时文件处理换行
TMP=$(mktemp)

# 写入新条目
echo "## [${VERSION}] - ${DATE}" > "$TMP"
echo "" >> "$TMP"
echo "${MSG}" >> "$TMP"
echo "" >> "$TMP"

# 在第一个 ## 之前插入新条目
if grep -q "^## \[" CHANGELOG.md 2>/dev/null; then
  # 已有条目，插入到第一个 ## 之前
  awk '
    /^## \[/ && !done {
      while ((getline line < tmpfile) > 0) {
        print line
      }
      close(tmpfile)
      done=1
    }
    { print }
  ' tmpfile="$TMP" CHANGELOG.md > "${TMP}.new"
  mv "${TMP}.new" CHANGELOG.md
else
  # 没有条目，追加到文件顶部
  cat CHANGELOG.md >> "$TMP"
  mv "$TMP" CHANGELOG.md
fi

rm -f "$TMP"

# ── Git 提交 ────────────────────────────────────────────
echo ""
echo "📤 提交到 GitHub..."
git add -A
git commit -m "release: v${VERSION} - ${MSG}"
git pull --rebase origin main
git push origin main

echo ""
echo "✅ 发布完成！v${VERSION}"
echo "   GitHub Pages: https://wolf173331.github.io/brickpush/"
echo "   Cloudflare:   https://qlplay.top (约1-2分钟生效)"
