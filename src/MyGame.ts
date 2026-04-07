import { Game, SceneManager, globalEventBus, globalAssets } from 'agent-gamedev';
import { MenuScene, GameScene, GameOverScene, LeaderboardScene } from './scenes';
import { MultiplayerMenuScene } from './scenes/MultiplayerMenuScene';
import { NetGameScene } from './scenes/NetGameScene';
import { LockstepGameScene } from './scenes/LockstepGameScene';
import { GAME_WIDTH, GAME_HEIGHT, GAME_BG_COLOR, ASSETS, LEVELS, loadLevels, setCurrentLevelIndex } from './constants';
import { resetRunHp, resetRunScore, resetPlayerColor } from './gameProgress';
import { gameAudio } from './audio';

const SVG_DIR = 'assets/svg';
const PNG_DIR = 'assets/png';
const RASTER_TEXTURE_IDS: ReadonlySet<string> = new Set([ASSETS.BOMB_BLOCK]);

export class MyGame extends Game {
  private sceneManager!: SceneManager;
  private isInitialized = false;

  constructor() {
    super({
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: GAME_BG_COLOR,
      containerId: 'game-container',
      showFps: false,
    });
  }

  protected async create(): Promise<void> {
    console.log('MyGame.create() started');
    
    // Load levels data first
    try {
      await loadLevels();
      console.log(`Loaded ${LEVELS.length} levels`);
    } catch (error) {
      console.error('Failed to load levels:', error);
    }

    // Load every SVG asset before entering any scene
    try {
      console.log('Loading assets...');
      await Promise.all(
        Object.values(ASSETS).map((id) =>
          globalAssets.loadTexture(
            id,
            RASTER_TEXTURE_IDS.has(id)
              ? `${PNG_DIR}/${id}.png`
              : `${SVG_DIR}/${id}.svg`
          )
        )
      );
      console.log('Assets loaded successfully');
    } catch (error) {
      console.error('Failed to load assets:', error);
    }

    // Create scene manager
    console.log('Creating scene manager...');
    this.sceneManager = this.createSceneManager();
    console.log('Scene manager created:', this.sceneManager);
    gameAudio.init();

    // Register scenes
    console.log('Registering scenes...');
    this.sceneManager.register('menu', new MenuScene());
    this.sceneManager.register('game', new GameScene());
    this.sceneManager.register('gameover', new GameOverScene());
    this.sceneManager.register('leaderboard', new LeaderboardScene());
    this.sceneManager.register('multiplayer', new MultiplayerMenuScene());
    this.sceneManager.register('netgame', new NetGameScene());
    this.sceneManager.register('lockstep', new LockstepGameScene());
    console.log('Scenes registered');

    // Scene transition events
    globalEventBus.on('scene:game', () => {
      setCurrentLevelIndex(0);
      resetRunScore();
      resetRunHp();
      resetPlayerColor(); // 新游戏时重置主角颜色（重新随机）
      this.sceneManager.replace('game', this.getWorld());
    });

    globalEventBus.on('scene:menu', () => {
      setCurrentLevelIndex(0);
      resetRunScore();
      resetRunHp();
      this.sceneManager.replace('menu', this.getWorld());
    });

    globalEventBus.on('scene:gameover', (data: { score: number; victoryType: string }) => {
      this.sceneManager.replace('gameover', this.getWorld(), data);
    });

    globalEventBus.on('scene:leaderboard', () => {
      this.sceneManager.replace('leaderboard', this.getWorld());
    });

    globalEventBus.on('scene:multiplayer', () => {
      this.sceneManager.replace('multiplayer', this.getWorld());
    });

    globalEventBus.on('scene:netgame', () => {
      this.sceneManager.replace('netgame', this.getWorld());
    });
    
    globalEventBus.on('scene:lockstep', () => {
      this.sceneManager.replace('lockstep', this.getWorld());
    });

    // Start with menu
    console.log('Starting with menu scene...');
    this.sceneManager.push('menu', this.getWorld());
    this.isInitialized = true;
    console.log('MyGame.create() completed');
  }

  protected update(deltaTime: number): void {
    if (!this.isInitialized) {
      // 等待初始化完成
      return;
    }
    if (!this.sceneManager) {
      console.error('sceneManager is not defined!');
      return;
    }
    this.sceneManager.update(this.getWorld(), deltaTime);
  }
}
