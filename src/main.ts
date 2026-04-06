import { MyGame } from './MyGame';

// 开发环境加载调试工具
if (import.meta.env.DEV) {
  import('./utils/leaderboardDebug');
}

new MyGame().run();
