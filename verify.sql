-- 验证表是否存在
SELECT tablename FROM pg_tables WHERE tablename = 'leaderboard';

-- 验证表是否在 realtime publication 中
SELECT pubname, tablename 
FROM pg_publication_tables 
WHERE tablename = 'leaderboard';
