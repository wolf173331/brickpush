#!/bin/bash
cd "$(dirname "$0")"
echo "🎮 启动游戏开发服务器..."
npx vite &
sleep 2
open "http://localhost:3000/brickpush/"
wait
