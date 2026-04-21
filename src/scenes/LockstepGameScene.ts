/**
 * 帧同步游戏场景
 * 
 * 架构：
 * - 使用 LockstepSync 进行确定性同步
 * - 30fps 固定逻辑帧，60fps 渲染
 * - 支持录像回放
 */

import { GameScene } from './GameScene';
import { LockstepSync, FrameInput, PlayerInput, ReplayData } from '../network/LockstepSync';
import { setNpcSquirrelEnabled, gridToWorld, CELL_EMPTY } from '../constants';
import { TransformComponent, UIEntityBuilder } from 'agent-gamedev';
import type { IWorld } from 'agent-gamedev';
import { InputSystem, KEYS } from 'agent-gamedev';

// 确定性随机数（确保双方一致，预留用于AI同步）
/*
class DeterministicRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed;
  }
  
  // 线性同余生成器
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  
  // 范围随机
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  
  // 整数随机
  rangeInt(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
}
*/

export class LockstepGameScene extends GameScene {
  private sync: LockstepSync | null = null;
  private isHost = false;
  protected isMultiplayer = false;
  
  // 确定性随机（预留，用于录像回放时确定性AI）
  // private rng: DeterministicRandom | null = null;
  
  // 玩家实体
  private p1Entity: any = null;
  private p2Entity: any = null;
  private p1Visual: { x: number; y: number; col: number; row: number } = { x: 0, y: 0, col: 0, row: 0 };
  private p2Visual: { x: number; y: number; col: number; row: number } = { x: 0, y: 0, col: 0, row: 0 };
  
  // 输入状态
  private currentInput: PlayerInput = { up: false, down: false, left: false, right: false };
  
  // 录像回放模式
  private isReplay = false;
  private replayFrameIndex = 0;
  
  // 游戏状态
  private gameStarted = false;
  // private frameCount = 0;
  private currentWorld: IWorld | null = null;

  constructor() {
    super();
  }

  // ========================================================================
  // 初始化
  // ========================================================================

  async onEnter(world: IWorld, data?: any): Promise<void> {
    console.log('[Lockstep] 进入帧同步游戏场景');
    
    this.isHost = data?.isHost ?? false;
    this.isMultiplayer = data?.isHost !== undefined;
    this.isReplay = data?.replay !== undefined;
    
    // 禁用松鼠
    if (this.isMultiplayer) {
      setNpcSquirrelEnabled(false);
    }
    
    // 调用父类初始化（加载关卡）
    super.onEnter(world, data);
    
    if (this.isReplay) {
      // 回放模式
      this.startReplay(world, data.replay);
    } else if (this.isMultiplayer) {
      // 联机模式
      await this.startMultiplayer(world, data);
    } else {
      // 本地模式
      this.startLocal(world);
    }
  }

  // ========================================================================
  // 联机模式
  // ========================================================================

  private async startMultiplayer(world: IWorld, data: any): Promise<void> {
    console.log(`[Lockstep] 启动联机模式 - ${this.isHost ? '房主' : '客人'}`);
    
    // 创建同步实例
    this.sync = new LockstepSync(this.isHost, data.seed);
    
    // 设置回调
    this.sync.onFrame = (frame, inputs) => this.onLockstepFrame(world, frame, inputs);
    this.sync.onConnected = () => {
      console.log('[Lockstep] 连接成功，开始游戏');
      this.gameStarted = true;
      // 移除 READY 遮罩
      (this as any).phase = 'playing';
      const readyEntity = (this as any).readyEntity;
      if (readyEntity) {
        world.destroyEntity(readyEntity);
        (this as any).readyEntity = null;
      }
    };
    
    // 显示连接 UI
    this.showConnectionUI(world);
    
    // 建立连接
    if (this.isHost) {
      await this.setupHost(world);
    } else {
      await this.setupClient(world, data.offer);
    }
  }

  private async setupHost(world: IWorld): Promise<void> {
    const offer = await this.sync!.createOffer();
    
    // 显示 Offer 代码
    console.log('[Lockstep] Host Offer:', JSON.stringify(offer));
    
    // 等待用户输入 Answer
    this.showSignalUI(world, 'host', JSON.stringify(offer));
  }

  private async setupClient(world: IWorld, hostOffer?: string): Promise<void> {
    if (!hostOffer) {
      // 显示输入框让用户输入 Offer
      this.showSignalUI(world, 'client');
      return;
    }
    
    const offer = JSON.parse(hostOffer);
    const answer = await this.sync!.acceptOffer(offer);
    
    console.log('[Lockstep] Client Answer:', JSON.stringify(answer));
    this.showSignalUI(world, 'answer', JSON.stringify(answer));
  }

  // ========================================================================
  // 本地模式
  // ========================================================================

  private startLocal(world: IWorld): void {
    console.log('[Lockstep] 本地模式');
    // this.rng = new DeterministicRandom(Date.now());
    this.gameStarted = true;
    
    // 移除 READY 遮罩
    setTimeout(() => {
      (this as any).phase = 'playing';
      const readyEntity = (this as any).readyEntity;
      if (readyEntity) {
        world.destroyEntity(readyEntity);
        (this as any).readyEntity = null;
      }
    }, 1000);
  }

  // ========================================================================
  // 回放模式
  // ========================================================================

  private startReplay(world: IWorld, replay: ReplayData): void {
    console.log('[Lockstep] 回放模式');
    // this.rng = new DeterministicRandom(replay.seed);
    this.isReplay = true;
    this.replayFrameIndex = 0;
    
    // 设置回放速度
    const replaySpeed = 1; // 1x 速度
    
    const playNextFrame = () => {
      if (this.replayFrameIndex >= replay.frames.length) {
        console.log('[Lockstep] 回放结束');
        return;
      }
      
      const frameData = replay.frames[this.replayFrameIndex];
      this.onLockstepFrame(world, frameData.frame, frameData);
      this.replayFrameIndex++;
      
      setTimeout(playNextFrame, LockstepSync.FRAME_TIME / replaySpeed);
    };
    
    setTimeout(playNextFrame, 1000);
  }

  // ========================================================================
  // 帧同步核心（每帧调用）
  // ========================================================================

  private onLockstepFrame(world: IWorld, frame: number, inputs: FrameInput): void {
    // this.frameCount = frame;
    
    // 1. 更新玩家位置（确定性移动）
    this.updatePlayer(world, 1, inputs.p1);
    this.updatePlayer(world, 2, inputs.p2);
    
    // 2. 更新方块（推箱子逻辑）
    this.updateBlocks(world);
    
    // 3. 更新怪物（确定性 AI）
    this.stepEnemies(world, frame);
    
    // 4. 更新 HUD
    if (frame % 30 === 0) { // 每秒更新
      this.refreshHUD(world);
    }
  }

  private updatePlayer(world: IWorld, playerId: number, input: PlayerInput): void {
    // 根据输入计算方向
    let dc = 0, dr = 0;
    if (input.up) dr = -1;
    else if (input.down) dr = 1;
    else if (input.left) dc = -1;
    else if (input.right) dc = 1;
    
    if (dc === 0 && dr === 0) return;
    
    // 获取玩家位置
    const isP1 = playerId === 1;
    const visual = isP1 ? this.p1Visual : this.p2Visual;
    
    const nc = visual.col + dc;
    const nr = visual.row + dr;
    
    // 检查碰撞
    const grid = (this as any).grid;
    if (!this.isValidPosition(nc, nr)) return;
    
    const cell = grid[nr][nc];
    
    if (cell === CELL_EMPTY) {
      // 空地，直接移动
      grid[visual.row][visual.col] = CELL_EMPTY;
      visual.col = nc;
      visual.row = nr;
      grid[nr][nc] = 9; // PLAYER
      
      const pos = gridToWorld(nc, nr);
      visual.x = pos.x;
      visual.y = pos.y;
    } else if (cell === 10) {
      // BLOCK - 推箱子
      const pushNc = nc + dc;
      const pushNr = nr + dr;
      
      if (this.isValidPosition(pushNc, pushNr) && grid[pushNr][pushNc] === CELL_EMPTY) {
        // 可以推
        grid[pushNr][pushNc] = 10; // BLOCK
        grid[nr][nc] = 9; // PLAYER
        grid[visual.row][visual.col] = CELL_EMPTY;
        
        visual.col = nc;
        visual.row = nr;
        
        const pos = gridToWorld(nc, nr);
        visual.x = pos.x;
        visual.y = pos.y;
        
        // 更新方块视觉位置
        this.updateBlockVisual(pushNc, pushNr);
      }
    }
    
    // 更新实体位置
    this.updatePlayerVisual(world, playerId, visual.x, visual.y);
  }

  private updatePlayerVisual(world: IWorld, playerId: number, x: number, y: number): void {
    const entity = playerId === 1 ? this.p1Entity : this.p2Entity;
    if (!entity) return;
    
    const transform = world.getComponent<TransformComponent>(entity, 'TransformComponent');
    if (transform) {
      transform.x = x;
      transform.y = y;
    }
  }

  private updateBlockVisual(col: number, row: number): void {
    // 找到对应格子位置的方块并更新
    const blocks = (this as any).blocks as Map<string, any>;
    if (!blocks) return;
    
    for (const [, block] of blocks) {
      if (block.col === col && block.row === row) {
        const pos = gridToWorld(col, row);
        block.x = pos.x;
        block.y = pos.y;
        
        if (this.currentWorld) {
          const transform = this.currentWorld.getComponent<TransformComponent>(block.entity, 'TransformComponent');
          if (transform) {
            transform.x = pos.x;
            transform.y = pos.y;
          }
        }
        break;
      }
    }
  }

  private updateBlocks(_world: IWorld): void {
    // 方块逻辑在 updatePlayer 中处理（推箱子）
  }

  private stepEnemies(_world: IWorld, _frame: number): void {
    // 确定性敌人 AI（简化版）
    // 实际应该实现完整的确定性 AI
  }

  // ========================================================================
  // 主循环
  // ========================================================================

  update(world: IWorld, deltaTime: number): void {
    this.currentWorld = world;
    
    if (!this.gameStarted && !this.isReplay) {
      // 等待连接
      return;
    }
    
    if (this.isMultiplayer && this.sync) {
      // 收集输入
      this.collectInput(world);
    } else if (!this.isMultiplayer) {
      // 本地模式：直接处理输入
      this.handleLocalInput(world, deltaTime);
    }
    
    // 父类更新（渲染等）
    // 注意：不调用 super.update 的游戏逻辑，只调用渲染
  }

  private collectInput(world: IWorld): void {
    const inputSystem = world.getSystem<InputSystem>('InputSystem');
    if (!inputSystem) return;
    
    const input: PlayerInput = {
      up: inputSystem.isKeyDown(KEYS.W) || inputSystem.isKeyDown(KEYS.UP),
      down: inputSystem.isKeyDown(KEYS.S) || inputSystem.isKeyDown(KEYS.DOWN),
      left: inputSystem.isKeyDown(KEYS.A) || inputSystem.isKeyDown(KEYS.LEFT),
      right: inputSystem.isKeyDown(KEYS.D) || inputSystem.isKeyDown(KEYS.RIGHT),
    };
    
    // 只在变化时更新
    if (JSON.stringify(input) !== JSON.stringify(this.currentInput)) {
      this.currentInput = input;
      this.sync?.setLocalInput(input);
    }
  }

  private handleLocalInput(_world: IWorld, _dt: number): void {
    // 本地模式直接处理
    // 这里简化处理，实际应该固定帧率
  }

  // ========================================================================
  // UI
  // ========================================================================

  private showConnectionUI(_world: IWorld): void {
    // 显示连接状态背景（使用半透明黑色背景）
    // 简化显示，只使用文本
  }

  private showSignalUI(world: IWorld, mode: 'host' | 'client' | 'answer', data?: string): void {
    // 清除旧的UI
    // 显示信令交换 UI
    const titleText = mode === 'host' ? '创建房间' : (mode === 'client' ? '加入房间' : '等待连接');
    
    // 标题
    const title = UIEntityBuilder.create(world, 960, 720)
      .withUITransform({ anchor: 'top-center', y: 150, width: 500, height: 40 })
      .withText({ text: titleText, fontSize: 24, color: 0xFFFFFF, align: 'center' })
      .build();
    (this as any).trackEntity(title);
    
    if (mode === 'host' && data) {
      // 显示 Offer，等待 Answer
      const label = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 200, width: 500, height: 30 })
        .withText({ text: '复制下方代码发给对方，然后粘贴对方的回应：', fontSize: 14, color: 0xAAAAAA, align: 'center' })
        .build();
      (this as any).trackEntity(label);
      
      // Offer 显示区域（简化显示前100字符）
      const offerShort = data.substring(0, 100) + '...';
      const offerText = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 240, width: 550, height: 80 })
        .withText({ text: offerShort, fontSize: 10, color: 0x88FF88, align: 'left' })
        .build();
      (this as any).trackEntity(offerText);
      
      // 输入框提示
      const inputLabel = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 340, width: 500, height: 30 })
        .withText({ text: '按 F12 打开控制台复制完整代码', fontSize: 12, color: 0xFFFF88, align: 'center' })
        .build();
      (this as any).trackEntity(inputLabel);
      
      console.log('%c[Lockstep] 完整 Offer 代码：', 'color: #88ff88; font-size: 14px');
      console.log(data);
      
    } else if (mode === 'client') {
      // 客人输入 Offer
      const label = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 200, width: 500, height: 30 })
        .withText({ text: '请对方创建房间，然后粘贴对方的代码：', fontSize: 14, color: 0xAAAAAA, align: 'center' })
        .build();
      (this as any).trackEntity(label);
      
      // 提示在控制台输入
      const hint = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 280, width: 500, height: 60 })
        .withText({ text: '在控制台输入：\njoinGame("粘贴对方的代码")', fontSize: 12, color: 0xFFFF88, align: 'center' })
        .build();
      (this as any).trackEntity(hint);
      
      // 暴露全局函数
      (window as any).joinGame = (offerStr: string) => {
        this.setupClient(this.currentWorld!, offerStr);
      };
      
    } else if (mode === 'answer' && data) {
      // 显示 Answer
      const label = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 200, width: 500, height: 30 })
        .withText({ text: '复制下方代码发给房主：', fontSize: 14, color: 0xAAAAAA, align: 'center' })
        .build();
      (this as any).trackEntity(label);
      
      const answerShort = data.substring(0, 100) + '...';
      const answerText = UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 240, width: 550, height: 80 })
        .withText({ text: answerShort, fontSize: 10, color: 0x88FF88, align: 'left' })
        .build();
      (this as any).trackEntity(answerText);
      
      console.log('%c[Lockstep] 完整 Answer 代码：', 'color: #88ff88; font-size: 14px');
      console.log(data);
      
      // 暴露全局函数给房主
      (window as any).acceptAnswer = (answerStr: string) => {
        this.sync?.acceptAnswer(JSON.parse(answerStr));
      };
    }
  }

  private refreshHUD(_world: IWorld): void {
    // 更新 HUD
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  private isValidPosition(col: number, row: number): boolean {
    const grid = (this as any).grid;
    if (!grid) return false;
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
  }

  onExit(world: IWorld): void {
    // 保存录像
    if (this.sync && this.isHost) {
      const replay = this.sync.getReplayData();
      console.log('[Lockstep] 录像数据:', replay);
    }
    
    setNpcSquirrelEnabled(true);
    super.onExit(world);
  }
}
