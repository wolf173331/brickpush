/**
 * 双人联机游戏场景 - 状态同步模式
 * 
 * 架构：
 * - 房主（Host）：运行完整游戏逻辑，每帧广播 GameState
 * - 客人（Guest）：发送输入，接收 GameState，只负责渲染
 */

import { TransformComponent, EntityBuilder, UIEntityBuilder, TRANSFORM_COMPONENT, InputSystem, SPRITE_COMPONENT, SpriteComponent } from 'agent-gamedev';
import type { IWorld, EntityId } from 'agent-gamedev';
import { GameScene } from './GameScene';
import { NetworkManager, GameState, PlayerInput, EntityState } from '../network/NetworkManager';
import { gridToWorld, TILE_SIZE, Z_PLAYER, Z_ENEMY, ASSETS, CELL_EMPTY, setNpcSquirrelEnabled, ENEMY_TEXTURES } from '../constants';
import { globalEventBus } from 'agent-gamedev';
import { KEYS } from 'agent-gamedev';

/** 远程玩家数据结构 */
interface RemotePlayer {
  entity: EntityId;
  col: number;
  row: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
}

export class NetGameScene extends GameScene {
  private network: NetworkManager;
  private remotePlayer: RemotePlayer | null = null;
  protected isMultiplayer: boolean = false;
  private world: IWorld | null = null;
  
  // 状态同步
  private isHost: boolean = false;
  private syncTimer: number = 0;
  private readonly SYNC_INTERVAL = 0.05; // 20fps 同步
  private frameCount: number = 0;
  
  // 客人输入缓存
  private currentInput: PlayerInput = { up: false, down: false, left: false, right: false, timestamp: 0 };
  private lastInputTime: number = 0;
  
  // 方块同步映射
  private blockIdMap: Map<EntityId, number> = new Map();
  private nextBlockId: number = 1000;
  private blockSyncMap: Map<number, any> = new Map();
  
  // 客人输入处理
  private remoteInput: PlayerInput = { up: false, down: false, left: false, right: false, timestamp: 0 };
  
  // 观察模式状态
  private localPlayerDead: boolean = false;
  private remotePlayerDead: boolean = false;
  private observerModeUI: EntityId | null = null;
  private isObserverMode: boolean = false;


  constructor() {
    super();
    this.network = NetworkManager.getInstance();
  }

  onEnter(world: IWorld, data?: any): void {
    this.world = world;
    
    // 检查是否是多人模式
    this.isMultiplayer = data?.multiplayer === true || this.network.isConnected();
    this.isHost = this.network.isRoomHost();
    
    // 多人模式禁用松鼠
    if (this.isMultiplayer) {
      console.log('[NetGame] 多人模式，禁用松鼠');
      setNpcSquirrelEnabled(false);
    }

    // 设置网络回调（必须在 super.onEnter 之前）
    if (this.isMultiplayer) {
      this.setupNetworkCallbacks();
    }

    // 调用父类初始化
    super.onEnter(world, data);

    if (!this.isMultiplayer) {
      console.log('[NetGame] 本地模式');
      return;
    }

    console.log(`[NetGame] 状态同步模式 - ${this.isHost ? '房主' : '客人'}`);
    
    // 设置本地玩家颜色：房主白色，客人红色
    this.setLocalPlayerColor(world);

    // 客人自动开始游戏
    if (!this.isHost) {
      this.startGame();
    }

    // 客人：阻止自动刷怪，等待房主同步
    if (!this.isHost) {
      console.log('[NetGame] 客人阻止自动刷怪');
      (this as any).totalWaves = 0; // 阻止 updateWaves 刷怪
      
      // 请求初始状态
      setTimeout(() => {
        this.network.requestInitialState();
      }, 200);
    }

    // 创建远程玩家实体（双方都需要）
    this.createRemotePlayerEntity(world);

    // 显示联机提示
    this.showMultiplayerHUD(world);
  }
  
  /** 设置本地玩家颜色 */
  private setLocalPlayerColor(world: IWorld): void {
    const p = (this as any).player;
    if (!p) return;
    
    // 房主白色，客人红色
    const localColor = this.isHost ? 0xFFFFFF : 0xFF6B6B;
    
    // 获取 sprite 组件并设置颜色
    const sprite = world.getComponent<any>(p.entity, 'SpriteComponent');
    if (sprite && sprite.tint !== undefined) {
      sprite.tint = localColor;
    }
    
    // 或者使用 tint 组件
    // 注意：需要确保玩家实体有 tint 组件
  }

  /** 创建远程玩家实体 */
  private createRemotePlayerEntity(world: IWorld): void {
    setTimeout(() => {
      const p = (this as any).player;
      if (!p) {
        console.error('[NetGame] 本地玩家未创建');
        return;
      }

      const spawnPos = this.findEmptyPositionNear(p.col, p.row);
      if (!spawnPos) {
        console.error('[NetGame] 找不到空位生成远程玩家');
        return;
      }

      const pos = gridToWorld(spawnPos.c, spawnPos.r);
      
      // 颜色：房主视角远程玩家是红色（客人），客人视角远程玩家是白色（房主）
      const remoteColor = this.isHost ? 0xFF6B6B : 0xFFFFFF;
      const entity = this.createPlayerEntity(world, pos.x, pos.y, remoteColor);
      
      this.remotePlayer = {
        entity,
        col: spawnPos.c,
        row: spawnPos.r,
        x: pos.x,
        y: pos.y,
        targetX: pos.x,
        targetY: pos.y,
      };

      const grid = (this as any).grid;
      if (grid && grid[spawnPos.r]) {
        grid[spawnPos.r][spawnPos.c] = 9;
      }
      
      console.log(`[NetGame] 远程玩家实体创建: (${spawnPos.c}, ${spawnPos.r})`);
    }, 100);
  }

  /** 创建玩家实体 */
  private createPlayerEntity(world: IWorld, x: number, y: number, color: number): EntityId {
    const entity = EntityBuilder.create(world, 960, 720)
      .withTransform({ x, y })
      .withSprite({ 
        textureId: ASSETS.PLAYER1, 
        width: TILE_SIZE, 
        height: TILE_SIZE, 
        zIndex: Z_PLAYER 
      })
      .withTint({ color })
      .build();

    (this as any).trackEntity(entity);
    return entity;
  }

  /** 在指定位置附近找空位 */
  private findEmptyPositionNear(col: number, row: number): { c: number; r: number } | null {
    const grid = (this as any).grid;
    const offsets = [
      { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
      { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
      { dc: 2, dr: 0 }, { dc: -2, dr: 0 },
    ];

    for (const offset of offsets) {
      const nc = col + offset.dc;
      const nr = row + offset.dr;
      if (this.isValidPosition(nc, nr) && grid[nr][nc] === CELL_EMPTY) {
        return { c: nc, r: nr };
      }
    }
    return null;
  }

  /** 检查位置是否有效 */
  private isValidPosition(col: number, row: number): boolean {
    const grid = (this as any).grid;
    if (!grid) return false;
    return row >= 0 && row < grid.length && col >= 0 && col < grid[0].length;
  }

  /** 设置网络回调 */
  private setupNetworkCallbacks(): void {
    // 客人：收到游戏状态（游戏中持续同步）
    this.network.onGameState = (state: GameState) => {
      this.applyGameState(state);
    };

    // 客人：收到初始状态（加入时一次性）
    this.network.onInitialState = (state: GameState) => {
      console.log('[NetGame] 收到初始状态');
      this.applyInitialState(state);
    };

    // 房主：收到客人输入
    this.network.onPlayerInput = (input: PlayerInput) => {
      this.remoteInput = input;
    };

    // 房主：客人请求初始状态
    this.network.onRequestInitialState = () => {
      console.log('[NetGame] 客人请求初始状态');
      return this.collectFullGameState();
    };

    // 双方：游戏开始
    this.network.onGameStart = () => {
      console.log('[NetGame] 收到游戏开始信号');
      this.startGame();
    };

    this.network.onRoomClosed = () => {
      alert('对方断开连接');
      globalEventBus.emit('scene:menu');
    };
  }

  /** 开始游戏（跳过 READY 阶段） */
  private startGame(): void {
    const phase = (this as any).phase;
    if (phase === 'ready') {
      console.log('[NetGame] 客人开始游戏');
      (this as any).phase = 'playing';
      
      const readyEntity = (this as any).readyEntity;
      if (readyEntity && this.world) {
        this.world.destroyEntity(readyEntity);
        (this as any).readyEntity = null;
      }
      
      this.doActivateEnemies();
    }
  }
  
  /** 激活敌人 */
  private doActivateEnemies(): void {
    const enemies = (this as any).enemies as any[];
    if (enemies) {
      for (const enemy of enemies) {
        if (enemy.spawnDelay !== undefined) {
          enemy.spawnDelay = 0;
        }
      }
    }
  }

  // ========================================================================
  // 核心更新逻辑
  // ========================================================================

  update(world: IWorld, deltaTime: number): void {
    if (!this.isMultiplayer) {
      super.update(world, deltaTime);
      return;
    }

    if (this.isHost) {
      this.updateHost(world, deltaTime);
    } else {
      this.updateGuest(world, deltaTime);
    }
  }

  /** 房主更新逻辑 */
  private updateHost(world: IWorld, deltaTime: number): void {
    // 1. 处理远程玩家输入（在 super.update 之前）
    this.processRemotePlayerInput(world, deltaTime);
    
    // 2. 运行父类游戏逻辑
    super.update(world, deltaTime);
    
    // 2.5 检查玩家死亡状态（实现观察模式）
    this.checkPlayerDeath(world);

    // 3. 定时广播游戏状态
    this.syncTimer += deltaTime;
    if (this.syncTimer >= this.SYNC_INTERVAL) {
      this.syncTimer = 0;
      this.broadcastGameState(world);
    }

    this.frameCount++;
  }

  /** 客人更新逻辑 */
  private updateGuest(world: IWorld, deltaTime: number): void {
    // 1. 收集并发送输入
    this.collectAndSendInput(world);
    
    // 2. 更新输入系统（必须调用，否则摇杆等不会工作）
    // 但不运行游戏逻辑，只接收状态
    
    // 3. 平滑插值远程玩家
    if (this.remotePlayer) {
      this.interpolateRemotePlayer(world, deltaTime);
    }
    
    // 4. 更新UI渲染
    this.updateHUDRender(world);
  }

  /** 处理远程玩家输入（房主调用） */
  private processRemotePlayerInput(world: IWorld, dt: number): void {
    if (!this.remotePlayer) return;
    
    const rp = this.remotePlayer;
    const input = this.remoteInput;
    
    // 移动冷却（防止一下子滑动太远）
    if ((rp as any).moveCooldown > 0) {
      (rp as any).moveCooldown -= dt;
      return;
    }
    
    // 根据输入计算移动方向
    let dc = 0, dr = 0;
    if (input.up) dr = -1;
    else if (input.down) dr = 1;
    else if (input.left) dc = -1;
    else if (input.right) dc = 1;
    
    if (dc === 0 && dr === 0) return;
    
    // 检查是否可以移动
    const grid = (this as any).grid;
    const nc = rp.col + dc;
    const nr = rp.row + dr;
    
    if (this.isValidPosition(nc, nr) && grid[nr][nc] === CELL_EMPTY) {
      // 设置移动冷却（200ms）
      (rp as any).moveCooldown = 0.2;
      
      // 更新远程玩家位置
      grid[rp.row][rp.col] = CELL_EMPTY;
      rp.col = nc;
      rp.row = nr;
      grid[nr][nc] = 9; // CELL_PLAYER
      
      const pos = gridToWorld(nc, nr);
      rp.x = pos.x;
      rp.y = pos.y;
      
      const transform = world.getComponent<TransformComponent>(rp.entity, TRANSFORM_COMPONENT);
      if (transform) {
        transform.x = rp.x;
        transform.y = rp.y;
      }
    }
  }

  /** 收集输入并发送 */
  private collectAndSendInput(world: IWorld): void {
    const inputSystem = world.getSystem<InputSystem>('InputSystem');
    if (!inputSystem) return;
    
    const input: PlayerInput = {
      up: inputSystem.isKeyDown(KEYS.W) || inputSystem.isKeyDown(KEYS.UP),
      down: inputSystem.isKeyDown(KEYS.S) || inputSystem.isKeyDown(KEYS.DOWN),
      left: inputSystem.isKeyDown(KEYS.A) || inputSystem.isKeyDown(KEYS.LEFT),
      right: inputSystem.isKeyDown(KEYS.D) || inputSystem.isKeyDown(KEYS.RIGHT),
      timestamp: Date.now(),
    };

    // 每50ms发送一次，或输入变化时发送
    const now = Date.now();
    if (this.hasInputChanged(input) || now - this.lastInputTime > 50) {
      this.currentInput = input;
      this.network.sendInput(input);
      this.lastInputTime = now;
    }
  }

  /** 检查输入是否变化 */
  private hasInputChanged(newInput: PlayerInput): boolean {
    return (
      newInput.up !== this.currentInput.up ||
      newInput.down !== this.currentInput.down ||
      newInput.left !== this.currentInput.left ||
      newInput.right !== this.currentInput.right
    );
  }

  /** 广播游戏状态 */
  private broadcastGameState(world: IWorld): void {
    const state: GameState = {
      frame: this.frameCount,
      timestamp: Date.now(),
      players: this.collectPlayerStates(world),
      blocks: this.collectBlockStates(world),
      enemies: this.collectEnemyStates(world),
    };

    this.network.broadcastGameState(state);
  }

  /** 收集玩家状态 */
  private collectPlayerStates(world: IWorld): EntityState[] {
    const states: EntityState[] = [];
    const p = (this as any).player;

    // 本地玩家（房主）
    if (p) {
      const transform = world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
      states.push({
        id: 1,
        x: transform?.x ?? gridToWorld(p.col, p.row).x,
        y: transform?.y ?? gridToWorld(p.col, p.row).y,
        col: p.col,
        row: p.row,
        anim: p.movement?.isMoving ? 'move' : 'idle',
        active: !this.localPlayerDead, // false 表示死亡/观察模式
      });
    }

    // 远程玩家
    if (this.remotePlayer) {
      const rp = this.remotePlayer;
      states.push({
        id: 2,
        x: rp.x,
        y: rp.y,
        col: rp.col,
        row: rp.row,
        active: !this.remotePlayerDead, // false 表示死亡/观察模式
      });
    }

    return states;
  }

  /** 收集方块状态 */
  private collectBlockStates(world: IWorld): EntityState[] {
    const states: EntityState[] = [];
    const blocks = (this as any).blocks as Map<string, any>;
    
    if (!blocks) return states;

    for (const [, block] of blocks) {
      const transform = world.getComponent<TransformComponent>(block.entity, TRANSFORM_COMPONENT);
      if (transform) {
        let syncId = this.blockIdMap.get(block.entity);
        if (!syncId) {
          syncId = this.nextBlockId++;
          this.blockIdMap.set(block.entity, syncId);
        }
        
        states.push({
          id: syncId,
          x: transform.x,
          y: transform.y,
          col: block.col,
          row: block.row,
        });
      }
    }

    return states;
  }

  /** 收集怪物状态（包含所有敌人，用于初始同步） */
  private collectEnemyStates(world: IWorld): EntityState[] {
    const states: EntityState[] = [];
    const enemies = (this as any).enemies as any[];
    
    if (!enemies) return states;

    enemies.forEach((enemy, index) => {
      if (enemy.dying) return; // 跳过死亡中的敌人
      
      const transform = world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
      states.push({
        id: 200 + index,
        x: transform?.x ?? gridToWorld(enemy.col, enemy.row).x,
        y: transform?.y ?? gridToWorld(enemy.col, enemy.row).y,
        col: enemy.col,
        row: enemy.row,
        type: enemy.type,
        active: enemy.active,
      });
    });

    return states;
  }

  /** 收集完整游戏状态（用于初始同步） */
  private collectFullGameState(): GameState {
    if (!this.world) return { frame: 0, timestamp: Date.now(), players: [] };
    
    return {
      frame: this.frameCount,
      timestamp: Date.now(),
      players: this.collectPlayerStates(this.world),
      blocks: this.collectBlockStates(this.world),
      enemies: this.collectEnemyStates(this.world),
      // 标记为初始状态
      isInitial: true,
    } as GameState;
  }

  /** 客人：应用初始状态 */
  private applyInitialState(state: GameState): void {
    console.log('[NetGame] 应用初始状态');
    
    if (!this.world) return;
    
    // 先应用玩家和怪物（它们不需要特殊映射）
    if (state.players) {
      for (const playerState of state.players) {
        if (playerState.id === 1) {
          this.updateRemotePlayerVisual(playerState);
        } else if (playerState.id === 2) {
          this.updateLocalPlayerVisual(playerState);
        }
      }
    }
    
    // 初始化并应用方块
    if (state.blocks) {
      this.initBlockSyncMapFromState(state.blocks);
      this.applyBlockStates(state.blocks);
    }
    
    // 应用怪物
    if (state.enemies) {
      this.applyEnemyStates(state.enemies);
    }
  }
  
  /** 从状态初始化方块映射 */
  private initBlockSyncMapFromState(states: EntityState[]): void {
    const blocks = (this as any).blocks as Map<string, any>;
    if (!blocks) {
      console.log('[NetGame] 警告：blocks 不存在');
      return;
    }
    
    console.log(`[NetGame] 初始化方块映射：状态中有 ${states.length} 个方块，本地有 ${blocks.size} 个方块`);
    
    // 清空旧映射
    this.blockSyncMap.clear();
    
    // 按位置匹配方块和同步ID
    for (const state of states) {
      let found = false;
      for (const [, block] of blocks) {
        // 使用格子位置作为匹配键
        const key = `${block.col},${block.row}`;
        const stateKey = `${state.col},${state.row}`;
        
        // 如果格子位置匹配，建立映射
        if (key === stateKey) {
          this.blockSyncMap.set(state.id, block);
          found = true;
          break;
        }
      }
      if (!found) {
        console.log(`[NetGame] 警告：找不到位置 (${state.col},${state.row}) 的方块`);
      }
    }
    
    console.log(`[NetGame] 成功建立 ${this.blockSyncMap.size}/${states.length} 个方块映射`);
  }

  // ========================================================================
  // 客人：应用游戏状态
  // ========================================================================

  /** 客人：应用收到的游戏状态 */
  private applyGameState(state: GameState): void {
    if (!this.world) return;

    // 应用玩家位置和死亡状态
    if (state.players) {
      for (const playerState of state.players) {
        if (playerState.id === 1) {
          // 房主位置 -> 更新到远程玩家实体
          this.updateRemotePlayerVisual(playerState);
          // 检查房主死亡状态
          if (playerState.active === false && !this.remotePlayerDead) {
            this.remotePlayerDead = true;
            console.log('[NetGame] 房主死亡（客人视角）');
          }
        } else if (playerState.id === 2) {
          // 自己的位置（客人）-> 平滑跟随
          this.updateLocalPlayerVisual(playerState);
          // 检查自己是否死亡
          if (playerState.active === false && !this.localPlayerDead && !this.isObserverMode) {
            this.enterObserverMode(this.world);
          }
        }
      }
    }

    // 应用方块位置
    if (state.blocks) {
      this.applyBlockStates(state.blocks);
    }

    // 应用怪物位置
    if (state.enemies) {
      this.applyEnemyStates(state.enemies);
    }
    
    // 检查双方死亡（客人端）
    if (this.localPlayerDead && this.remotePlayerDead) {
      this.doGameOver(this.world, 'hp');
    }
  }

  /** 更新远程玩家视觉 */
  private updateRemotePlayerVisual(state: EntityState): void {
    if (!this.remotePlayer) return;

    const rp = this.remotePlayer;
    rp.targetX = state.x;
    rp.targetY = state.y;
    rp.col = state.col;
    rp.row = state.row;
  }

  /** 更新本地玩家视觉（客人端） */
  private updateLocalPlayerVisual(state: EntityState): void {
    const p = (this as any).player;
    if (!p || !this.world) return;

    const transform = this.world.getComponent<TransformComponent>(p.entity, TRANSFORM_COMPONENT);
    if (transform) {
      // 平滑插值到目标位置
      const lerpFactor = 0.3;
      transform.x += (state.x - transform.x) * lerpFactor;
      transform.y += (state.y - transform.y) * lerpFactor;
      p.col = state.col;
      p.row = state.row;
    }
  }

  /** 应用方块状态 */
  private applyBlockStates(states: EntityState[]): void {
    if (!this.world) return;

    for (const state of states) {
      const block = this.blockSyncMap.get(state.id);
      if (block) {
        block.col = state.col;
        block.row = state.row;
        
        const transform = this.world.getComponent<TransformComponent>(block.entity, TRANSFORM_COMPONENT);
        if (transform) {
          transform.x = state.x;
          transform.y = state.y;
        }
      }
    }
  }

  /** 应用怪物状态（客人端：创建+更新） */
  private applyEnemyStates(states: EntityState[]): void {
    if (!this.world) return;
    
    const enemies = (this as any).enemies as any[];
    const grid = (this as any).grid;
    
    for (const state of states) {
      const index = state.id - 200;
      let enemy = enemies[index];
      
      // 如果敌人不存在，创建它（初始同步时）
      if (!enemy && state.type !== undefined) {
        const pos = gridToWorld(state.col, state.row);
        const textureId = state.active 
          ? (ENEMY_TEXTURES[state.type] ?? ASSETS.ENEMY_FROG)
          : ASSETS.ENEMY_INACTIVE;
          
        const eid = EntityBuilder.create(this.world, 960, 720)
          .withTransform({ x: pos.x, y: pos.y })
          .withSprite({ textureId, width: TILE_SIZE, height: TILE_SIZE, zIndex: Z_ENEMY })
          .build();
        
        (this as any).trackEntity(eid);
        
        // 占用格子
        if (grid) {
          grid[state.row][state.col] = 11; // CELL_ENEMY_SPAWN
        }
        
        enemy = {
          col: state.col,
          row: state.row,
          entity: eid,
          type: state.type,
          active: state.active ?? false,
          moveCooldown: 1.0, // 简化处理，具体值由房主同步
          stunTimer: 0,
          activateTimer: state.active ? 0 : 9999, // 非激活状态保持未激活
          dying: false,
          movement: this.createMovementState(),
        };
        
        enemies[index] = enemy;
      }
      
      // 更新敌人位置
      if (enemy) {
        enemy.col = state.col;
        enemy.row = state.row;
        
        // 更新激活状态
        if (state.active !== undefined && enemy.active !== state.active) {
          enemy.active = state.active;
          const sprite = this.world.getComponent<SpriteComponent>(enemy.entity, SPRITE_COMPONENT);
          if (sprite) {
            sprite.textureId = state.active 
              ? (ENEMY_TEXTURES[enemy.type] ?? ASSETS.ENEMY_FROG)
              : ASSETS.ENEMY_INACTIVE;
          }
        }
        
        const transform = this.world.getComponent<TransformComponent>(enemy.entity, TRANSFORM_COMPONENT);
        if (transform) {
          transform.x = state.x;
          transform.y = state.y;
        }
      }
    }
  }
  
  /** 创建移动状态（简化版） */
  private createMovementState(): any {
    return {
      isMoving: false,
      startX: 0, startY: 0,
      targetX: 0, targetY: 0,
      sourceCol: 0, sourceRow: 0,
      targetCol: 0, targetRow: 0,
      progress: 0,
      duration: 0,
      elapsed: 0,
      direction: null,
    };
  }

  /** 平滑插值远程玩家 */
  private interpolateRemotePlayer(world: IWorld, dt: number): void {
    if (!this.remotePlayer) return;

    const rp = this.remotePlayer;
    const lerpSpeed = 15 * dt;
    
    rp.x += (rp.targetX - rp.x) * lerpSpeed;
    rp.y += (rp.targetY - rp.y) * lerpSpeed;

    const transform = world.getComponent<TransformComponent>(rp.entity, TRANSFORM_COMPONENT);
    if (transform) {
      transform.x = rp.x;
      transform.y = rp.y;
    }
  }

  /** 更新UI渲染（客人端） */
  private updateHUDRender(_world: IWorld): void {
    // 调用父类的 updateHUD 来更新 UI
    // 但不运行游戏逻辑
    // 这里我们手动更新计时器显示
    const timeLeft = (this as any).timeLeft;
    if (timeLeft !== undefined) {
      // 时间由房主同步，这里只负责显示
    }
  }

  // ========================================================================
  // 重写刷怪逻辑：客人不刷怪，只接收房主同步
  // ========================================================================
  
  // ========================================================================
  // UI
  // ========================================================================

  /** 显示联机 HUD */
  private showMultiplayerHUD(world: IWorld): void {
    const roomId = this.network.getRoomId();
    const role = this.isHost ? '房主' : '客人';
    
    (this as any).trackEntity(
      UIEntityBuilder.create(world, 960, 720)
        .withUITransform({ anchor: 'top-center', y: 80, width: 300, height: 30 })
        .withText({ 
          text: `🎮 ${role} | 房间: ${roomId}`, 
          fontSize: 14, 
          color: 0x88FF88, 
          align: 'center' 
        })
        .build()
    );
  }

  onExit(world: IWorld): void {
    if (this.isMultiplayer) {
      this.network.disconnect();
    }
    
    setNpcSquirrelEnabled(true);
    this.world = null;
    this.blockIdMap.clear();
    this.blockSyncMap.clear();
    
    super.onExit(world);
  }

  // ========================================================================
  // 观察模式 & 游戏结束逻辑
  // =======================================================================
  
  /** 检查玩家死亡状态（在父类 update 后调用） */
  private checkPlayerDeath(world: IWorld): void {
    if (!this.isMultiplayer || !this.isHost) return;
    
    const p = (this as any).player;
    if (!p || this.localPlayerDead) return;
    
    // 如果本地玩家HP归零
    if (p.hp <= 0) {
      console.log('[NetGame] 本地玩家死亡，进入观察模式');
      this.localPlayerDead = true;
      this.enterObserverMode(world);
    }
  }

  /** 进入观察模式 */
  private enterObserverMode(world: IWorld): void {
    if (this.isObserverMode) return;
    this.isObserverMode = true;
    this.localPlayerDead = true;
    
    console.log('[NetGame] 进入观察模式');
    
    // 显示观察模式提示
    this.observerModeUI = UIEntityBuilder.create(world, 960, 720)
      .withUITransform({ anchor: 'top-center', y: 120, width: 300, height: 40 })
      .withText({ 
        text: '👁️ 观察模式 - 等待队友', 
        fontSize: 18, 
        color: 0xFFFF88, 
        align: 'center' 
      })
      .build();
    (this as any).trackEntity(this.observerModeUI);
    
    // 检查是否两个玩家都死亡
    this.checkGameOver(world);
  }
  
  /** 检查游戏结束条件 */
  private checkGameOver(world: IWorld): void {
    if (this.localPlayerDead && this.remotePlayerDead) {
      // 两个玩家都死亡，游戏结束
      console.log('[NetGame] 双方死亡，游戏结束');
      this.doGameOver(world, 'hp');
    }
  }
  
  /** 执行游戏结束 */
  private doGameOver(world: IWorld, reason: 'hp' | 'time'): void {
    const phase = (this as any).phase;
    if (phase !== 'playing') return;
    (this as any).phase = 'complete';
    
    // 移除观察模式UI
    if (this.observerModeUI && this.world) {
      this.world.destroyEntity(this.observerModeUI);
      this.observerModeUI = null;
    }
    
    // 显示游戏结束文本
    const text = reason === 'hp' ? 'GAME OVER' : '时间到!';
    const eid = UIEntityBuilder.create(world, 960, 720)
      .withUITransform({ anchor: 'center', y: -20, width: 500, height: 80 })
      .withText({ text, fontSize: 56, color: 0xff6666, align: 'center' })
      .build();
    (this as any).trackEntity(eid);

    // 延迟后跳转
    setTimeout(() => {
      if (!this.isActive) return;
      const score = (this as any).getResolvedScore?.() ?? 0;
      globalEventBus.emit('scene:gameover', {
        score, victoryType: 'defeat',
        levelName: '联机模式',
        canSubmitScore: score > 0,
      });
    }, 2000);
  }
}
