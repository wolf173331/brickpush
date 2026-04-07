-- 1. 创建排行榜表（如果不存在）
CREATE TABLE IF NOT EXISTS leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);

-- 3. 查看已有的 publications
SELECT * FROM pg_publication;

-- 4. 将 leaderboard 表添加到 supabase_realtime publication（如果存在）
DO $$
BEGIN
  -- 检查 supabase_realtime 是否存在
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- 检查表是否已经在 publication 中
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'leaderboard'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE leaderboard;
      RAISE NOTICE 'leaderboard 表已添加到 realtime';
    ELSE
      RAISE NOTICE 'leaderboard 表已在 realtime 中';
    END IF;
  ELSE
    RAISE NOTICE 'supabase_realtime publication 不存在，请检查 Supabase Realtime 是否启用';
  END IF;
END $$;

-- 5. 验证
SELECT pubname, tablename 
FROM pg_publication_tables 
WHERE tablename = 'leaderboard';
