/**
 * 双人联机网络管理器
 * 使用 Supabase Realtime 实现状态同步
 */

import { supabase } from '../supabaseClient';

/** 玩家输入 */
export interface PlayerInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  timestamp: number;
}

/** 实体状态 */
export interface EntityState {
  id: number;           // 实体ID
  x: number;            // 像素位置X
  y: number;            // 像素位置Y
  col: number;          // 格子位置
  row: number;
  vx?: number;          // 速度（可选）
  vy?: number;
  anim?: string;        // 动画状态
  type?: number;        // 怪物类型（用于初始创建）
  active?: boolean;     // 是否激活
}

/** 游戏状态（每帧同步） */
export interface GameState {
  frame: number;        // 帧序号
  timestamp: number;    // 时间戳
  players: EntityState[];   // 所有玩家（本地+远程）
  blocks?: EntityState[];   // 方块
  enemies?: EntityState[];  // 怪物
  items?: EntityState[];    // 掉落物
  events?: GameEvent[];     // 游戏事件（推箱子、拾取等）
}

/** 游戏事件 */
export interface GameEvent {
  type: 'push' | 'break' | 'collect' | 'spawn' | 'damage';
  targetId?: number;
  col?: number;
  row?: number;
  data?: any;
}

export class NetworkManager {
  private static instance: NetworkManager;
  private channel: any = null;
  private roomId: string = '';
  private playerId: string = '';
  private isHost: boolean = false;
  
  // 回调函数
  onPlayerJoin?: (playerId: string) => void;
  onPlayerLeave?: () => void;
  onGameStart?: () => void;
  onRoomClosed?: () => void;
  
  // 状态同步回调
  onGameState?: (state: GameState) => void;      // 客人收到游戏状态
  onPlayerInput?: (input: PlayerInput) => void;  // 房主收到客人输入
  onRequestInitialState?: () => GameState | null; // 房主：客人请求初始状态
  onInitialState?: (state: GameState) => void;   // 客人收到初始状态

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  /** 生成随机房间号 */
  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  /** 生成玩家ID */
  private generatePlayerId(): string {
    return 'p_' + Math.random().toString(36).substring(2, 9);
  }

  /** 创建房间 */
  async createRoom(): Promise<string | null> {
    if (!supabase) {
      console.error('[Network] Supabase 未配置');
      return null;
    }

    this.roomId = this.generateRoomId();
    this.playerId = this.generatePlayerId();
    this.isHost = true;

    // 创建 Realtime 频道
    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    this.setupChannelHandlers();

    // 订阅频道
    await this.channel.subscribe();
    console.log(`[Network] 创建房间: ${this.roomId}, 玩家ID: ${this.playerId}`);

    return this.roomId;
  }

  /** 加入房间 */
  async joinRoom(roomId: string): Promise<boolean> {
    if (!supabase) {
      console.error('[Network] Supabase 未配置');
      return false;
    }

    this.roomId = roomId.toUpperCase();
    this.playerId = this.generatePlayerId();
    this.isHost = false;

    this.channel = supabase.channel(`room:${this.roomId}`, {
      config: {
        broadcast: { self: false },
      },
    });

    this.setupChannelHandlers();
    await this.channel.subscribe();

    // 发送加入消息给房主
    this.broadcast('player_join', { playerId: this.playerId });

    console.log(`[Network] 加入房间: ${this.roomId}, 玩家ID: ${this.playerId}`);
    return true;
  }

  /** 设置频道处理器 */
  private setupChannelHandlers(): void {
    if (!this.channel) return;

    // 监听游戏状态（客人接收）
    this.channel.on('broadcast', { event: 'game_state' }, ({ payload }: { payload: any }) => {
      if (!this.isHost && this.onGameState) {
        this.onGameState(payload.data);
      }
    });

    // 监听玩家输入（房主接收）
    this.channel.on('broadcast', { event: 'player_input' }, ({ payload }: { payload: any }) => {
      if (this.isHost && this.onPlayerInput) {
        this.onPlayerInput(payload.data);
      }
    });

    this.channel.on('broadcast', { event: 'player_join' }, ({ payload }: { payload: any }) => {
      console.log('[Network] 玩家加入:', payload.playerId);
      if (this.isHost && this.onPlayerJoin) {
        this.onPlayerJoin(payload.playerId);
      }
    });

    // 客人请求初始状态
    this.channel.on('broadcast', { event: 'request_initial_state' }, ({ payload }: { payload: any }) => {
      if (this.isHost && this.onRequestInitialState) {
        const state = this.onRequestInitialState();
        if (state) {
          this.broadcast('initial_state', { state, to: payload.from });
        }
      }
    });

    // 客人收到初始状态
    this.channel.on('broadcast', { event: 'initial_state' }, ({ payload }: { payload: any }) => {
      if (!this.isHost && this.onInitialState && payload.state) {
        this.onInitialState(payload.state);
      }
    });

    this.channel.on('broadcast', { event: 'game_start' }, (_payload: any) => {
      console.log('[Network] 游戏开始');
      if (this.onGameStart) {
        this.onGameStart();
      }
    });

    this.channel.on('broadcast', { event: 'room_closed' }, (_payload: any) => {
      console.log('[Network] 房间关闭');
      if (this.onRoomClosed) {
        this.onRoomClosed();
      }
    });
  }

  /** 
   * 广播游戏状态（房主调用）
   * 建议 15-20fps（66ms间隔）
   */
  broadcastGameState(state: GameState): void {
    if (!this.channel || !this.isHost) return;

    this.channel.send({
      type: 'broadcast',
      event: 'game_state',
      payload: {
        from: this.playerId,
        data: state,
      },
    });
  }

  /** 
   * 发送玩家输入（客人调用）
   * 每帧调用，或者输入变化时调用
   */
  sendInput(input: PlayerInput): void {
    if (!this.channel || this.isHost) return;

    this.channel.send({
      type: 'broadcast',
      event: 'player_input',
      payload: {
        from: this.playerId,
        data: input,
      },
    });
  }

  /** 
   * 请求初始状态（客人调用）
   * 加入房间后立即调用
   */
  requestInitialState(): void {
    if (!this.channel || this.isHost) return;

    this.channel.send({
      type: 'broadcast',
      event: 'request_initial_state',
      payload: {
        from: this.playerId,
      },
    });
  }

  /** 发送广播消息 */
  private broadcast(event: string, payload: any): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event,
      payload: { ...payload, from: this.playerId },
    });
  }

  /** 开始游戏（房主调用） */
  startGame(levelIndex: number = 0): void {
    if (!this.isHost) return;
    this.broadcast('game_start', { levelIndex, seed: Math.random() });
  }

  /** 关闭房间 */
  closeRoom(): void {
    if (this.isHost) {
      this.broadcast('room_closed', {});
    }
    this.disconnect();
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
    this.roomId = '';
    this.playerId = '';
    this.isHost = false;
  }

  /** 获取房间ID */
  getRoomId(): string {
    return this.roomId;
  }

  /** 获取玩家ID */
  getPlayerId(): string {
    return this.playerId;
  }

  /** 是否房主 */
  isRoomHost(): boolean {
    return this.isHost;
  }

  /** 是否已连接 */
  isConnected(): boolean {
    return this.channel !== null;
  }
}
