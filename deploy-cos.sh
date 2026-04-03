#!/bin/bash
# 腾讯云 COS 部署脚本
# 使用前需要先配置 coscmd：
#   pip install coscmd
#   coscmd config -a <SecretId> -s <SecretKey> -b <存储桶名-AppId> -r <地域>
# 地域示例：ap-shanghai / ap-guangzhou / ap-beijing

set -e
cd "$(dirname "$0")"

echo "🔨 构建（base=/）..."
VITE_BASE_PATH=/ npm run build

echo "📁 复制 levels.json..."
cp public/assets/levels.json dist/assets/levels.json

echo "🚀 上传到 COS..."
coscmd upload -r dist/ /

echo "✅ 部署完成！"
