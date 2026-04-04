#!/bin/bash
# 一键构建 + 生成 changelog + 提交到 GitHub
# 用法: ./release.sh "修复了xxx问题，新增了yyy功能"
# 或者不带参数，脚本会提示输入

set -e
cd "$(dirname "$0")"

# ── 读取版本号 ──────────────────────────────────────────
VERSION=$(node -p "require('./package.json').version")
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

# ── 构建 ────────────────────────────────────────────────
echo ""
echo "🔨 构建中 (v${VERSION})..."
npm run build

echo "📁 更新 docs/ (GitHub Pages)..."
rm -rf docs
cp -r dist docs
cp public/assets/levels.json docs/assets/levels.json

# ── 更新 CHANGELOG.md ───────────────────────────────────
echo ""
echo "📋 更新 CHANGELOG.md..."

ENTRY="## [${VERSION}] - ${DATE}

${MSG}

"

# 在第一个 ## 之前插入新条目
if grep -q "^## \[" CHANGELOG.md 2>/dev/null; then
  # 已有条目，插入到第一个 ## 之前
  TMP=$(mktemp)
  awk -v entry="$ENTRY" '
    /^## \[/ && !done {
      printf "%s", entry
      done=1
    }
    { print }
  ' CHANGELOG.md > "$TMP"
  mv "$TMP" CHANGELOG.md
else
  # 没有条目，追加到文件末尾
  echo "" >> CHANGELOG.md
  echo "$ENTRY" >> CHANGELOG.md
fi

# ── Git 提交 ────────────────────────────────────────────
echo ""
echo "📤 提交到 GitHub..."
git add -A
git commit -m "release: v${VERSION} - ${MSG}"
git push origin main

echo ""
echo "✅ 发布完成！v${VERSION}"
echo "   GitHub Pages: https://wolf173331.github.io/brickpush/"
echo "   Cloudflare:   https://qlplay.top (约1-2分钟生效)"
