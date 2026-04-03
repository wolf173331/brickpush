# Supabase V2 集成指南

## 🎯 目标
为BrickPush游戏添加在线排行榜和未来的联机功能。

## 📋 已完成的工作

1. ✅ **安装了Supabase V2**: `@supabase/supabase-js@2.101.1`
2. ✅ **创建了配置文件**: `src/supabaseConfig.ts`
3. ✅ **创建了环境变量示例**: `.env.example`
4. ✅ **创建了使用示例**: `supabase-usage-example.ts`

## 🔧 现在需要你完成的步骤

### 步骤1: 获取Supabase配置信息
1. 登录到你的Supabase项目: https://app.supabase.com
2. 进入 **Settings → API**
3. 复制以下信息:
   - **Project URL**: `https://yzakiuvpqkjzlatdmiog.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YWtpdXZwcWtqemxhdGRtaW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzM3MjgsImV4cCI6MjA5MDcwOTcyOH0.ypwa3fMoOIo7e4heZtkJg-fP4yYAz341D71WYgyxwAY` (以`eyJ`开头)

### 步骤2: 配置环境变量
1. 复制 `.env.example` 为 `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. 编辑 `.env.local` 文件，填入你的Supabase信息:
   ```bash
   VITE_SUPABASE_URL=https://yzakiuvpqkjzlatdmiog.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl6YWtpdXZwcWtqemxhdGRtaW9nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzM3MjgsImV4cCI6MjA5MDcwOTcyOH0.ypwa3fMoOIo7e4heZtkJg-fP4yYAz341D71WYgyxwAY
   ```

### 步骤3: 创建数据库表
1. 在Supabase仪表板中，进入 **SQL Editor**
2. 执行以下SQL创建排行榜表:

```sql
-- 创建排行榜表
CREATE TABLE leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引提升查询性能
CREATE INDEX idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX idx_leaderboard_created_at ON leaderboard(created_at DESC);

-- 启用实时订阅 (重要!)
ALTER TABLE leaderboard REPLICA IDENTITY FULL;

-- 可选: 添加用户认证 (未来功能)
-- ALTER TABLE leaderboard ADD COLUMN user_id UUID REFERENCES auth.users(id);
```

### 步骤4: 配置CORS (重要!)
1. 在Supabase仪表板，进入 **Settings → API**
2. 在 **Configuration** 部分，找到 **CORS Settings**
3. 添加以下域名到允许列表:
   - `http://localhost:*`
   - `https://wolf173331.github.io`
   - `https://*.github.io`
4. 点击 **Save**

### 步骤5: 测试连接
1. 打开 `supabase-v2-test.html` 页面
2. 填入你的Supabase URL和Anon Key
3. 点击 **测试连接**
4. 确保所有测试都通过

## 🚀 集成到游戏

我已经准备了以下文件:

### 1. `src/supabaseConfig.ts`
- Supabase客户端配置
- 连接测试函数
- 表初始化函数

### 2. 需要修改的现有文件

**A. 修改 `src/gameProgress.ts`**:
```typescript
// 添加Supabase导入
import { supabase, GameConfig } from './supabaseConfig'

// 修改 loadLeaderboardShared 函数
export async function loadLeaderboardShared(): Promise<LeaderboardEntry[]> {
  if (GameConfig.ONLINE_FEATURES_ENABLED) {
    try {
      // 从Supabase获取在线排行榜
      const { data, error } = await supabase
        .from('leaderboard')
        .select('*')
        .order('score', { ascending: false })
        .limit(LEADERBOARD_MAX_ENTRIES)
        
      if (!error && data) {
        // 转换为游戏格式
        return data.map(entry => ({
          name: entry.player_name,
          score: entry.score,
          levelName: entry.level_name,
          timestamp: new Date(entry.created_at).getTime()
        }))
      }
    } catch (error) {
      console.warn('使用本地存储回退:', error)
    }
  }
  
  // 回退到本地存储
  return loadLeaderboard()
}

// 修改 saveLeaderboardEntryShared 函数类似
```

**B. 修改 `src/scenes/LeaderboardScene.ts` 和 `src/scenes/GameOverScene.ts`**:
- 更新导入语句
- 确保使用异步函数处理排行榜

## 🔍 测试流程

### 测试1: 本地开发测试
```bash
# 1. 启动开发服务器
npm run dev

# 2. 打开浏览器访问 http://localhost:5173
# 3. 完成一局游戏，查看排行榜是否保存
# 4. 刷新页面，查看排行榜是否加载
```

### 测试2: 跨浏览器测试
1. 用Chrome保存分数
2. 用Firefox或Safari打开查看
3. 应该能看到相同的排行榜

### 测试3: 网络状况测试
1. 断开网络，玩游戏
2. 应该回退到本地存储
3. 恢复网络，数据应该同步

## ⚠️ 常见问题

### Q1: 为什么我的Supabase连接失败？
- **检查**: 确保URL和Key正确
- **检查**: CORS配置是否正确
- **检查**: 项目是否活跃 (不是暂停状态)

### Q2: 为什么排行榜显示为空？
- **检查**: leaderboard表是否创建
- **检查**: 是否执行了正确的SQL
- **检查**: 浏览器控制台是否有错误

### Q3: 如何部署到GitHub Pages？
1. 在GitHub仓库的 **Settings → Secrets** 中添加:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. 构建会自动使用这些环境变量

### Q4: 多人联机功能何时实现？
- **第一阶段**: 在线排行榜 (本周完成)
- **第二阶段**: 联机房间系统 (下周开始)
- **第三阶段**: 实时游戏同步 (下周完成)

## 📊 监控和维护

### 查看数据
1. **Supabase仪表板**: 查看实时数据
2. **Logs**: 查看API调用日志
3. **Storage**: 监控使用量

### 性能优化
1. **索引**: 确保score和created_at有索引
2. **缓存**: 客户端缓存排行榜数据
3. **批量操作**: 避免频繁的单条插入

## 🎮 下一步计划

### 本周目标
1. ✅ 安装Supabase V2
2. 🔄 配置Supabase项目
3. 🔄 集成在线排行榜
4. 🔄 测试和部署

### 下周目标
1. 设计联机房间系统
2. 实现WebSocket通信
3. 添加实时位置同步
4. 优化游戏体验

## 📞 技术支持

如果遇到问题:
1. 查看Supabase文档: https://supabase.com/docs
2. 检查游戏控制台错误
3. 联系技术支持

---

**现在开始配置你的Supabase项目吧！完成后，你的游戏将拥有真正的在线排行榜功能！** 🚀