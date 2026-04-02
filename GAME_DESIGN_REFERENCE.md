# Brick Push 设计参考

这个文档整理当前版本里已经存在的主要命名、枚举和值，方便后续继续做关卡、怪物、道具和规则设计。

## 怪物列表

当前共有 4 种怪物：

1. `FROG`
   编号：`ENEMY_TYPE_FROG = 0`
   特点：移动偏慢，击杀后固定掉落黄钻
   贴图资源：`enemy-frog`

2. `BLOB`
   编号：`ENEMY_TYPE_BLOB = 1`
   特点：移动更快，偏随机乱窜
   贴图资源：`enemy-blue`

3. `BOW`
   编号：`ENEMY_TYPE_BOW = 2`
   特点：更主动朝玩家靠近
   贴图资源：`enemy-pink`

4. `GEAR`
   编号：`ENEMY_TYPE_GEAR = 3`
   特点：偏机械感，会优先沿玩家主轴推进
   贴图资源：`enemy-silver`

备注：
- `ENEMY_TEXTURES` 当前仍然沿用旧资源命名：
  - `0 -> enemy-frog`
  - `1 -> enemy-blue`
  - `2 -> enemy-pink`
  - `3 -> enemy-silver`

## 地图格子枚举

这些值用于关卡 `grid`：

| 名称 | 值 | 含义 |
| --- | ---: | --- |
| `CELL_EMPTY` | `0` | 空地 |
| `CELL_WALL` | `1` | 黑色砖墙 |
| `CELL_BLOCK` | `2` | 普通砖块 |
| `CELL_STAR_BLOCK` | `3` | 星星砖块，破坏后固定掉 `PUSH_POWERUP` |
| `CELL_HEART_BLOCK` | `4` | 心心砖块，用于集合通关 |
| `CELL_BOMB` | `5` | 炸弹砖块 |
| `CELL_ENEMY_SPAWN` | `6` | 敌人出生点 |
| `CELL_P1_SPAWN` | `7` | 玩家出生点 |
| `CELL_P2_SPAWN` | `8` | 当前未使用 |
| `CELL_PLAYER` | `9` | 运行时玩家占位 |
| `CELL_ITEM` | `10` | 运行时道具占位 |
| `CELL_SAFE` | `11` | 安全地格 / 草地边界 / 可恢复地格 |

## 砖块与可推动物

### 主要砖块

1. `CELL_BLOCK`
   普通砖块
   推到边缘继续推时会碎裂

2. `CELL_STAR_BLOCK`
   星星砖块
   推到边缘继续推时会碎裂
   必然掉落 `PUSH_POWERUP`

3. `CELL_HEART_BLOCK`
   心心砖块
   不能被普通碎裂逻辑破坏
   3 个连成横向或纵向连续时通关

4. `CELL_BOMB`
   炸弹砖块
   被推动后会一直滑到碰撞前
   碰撞后爆炸
   爆炸范围是 `3x3`
   可以炸掉黑色砖墙
   也会伤到玩家，扣 `1 HP`

### 可推动判定

当前视为可推动的类型：

- `CELL_BLOCK`
- `CELL_STAR_BLOCK`
- `CELL_HEART_BLOCK`
- `CELL_BOMB`

## 道具与掉落

### 当前道具

1. `ITEM_YELLOW`
   资源：`item-yellow`
   效果：`+500` 分

2. `ITEM_BLUE`
   资源：`item-blue`
   效果：`+300` 分

3. `PUSH_POWERUP`
   资源：`push-powerup`
   效果：
   - 推动距离 `+1`
   - 获得碎黑墙能力

### 当前固定掉落规则

- `STAR_BLOCK` 被破坏后固定掉 `PUSH_POWERUP`
- `FROG` 被击杀后固定掉黄钻 `ITEM_YELLOW`

## 玩家相关数值

| 名称 | 值 | 含义 |
| --- | ---: | --- |
| `PLAYER_MAX_HP` | `3` | 最大 HP |
| `PLAYER_MOVE_COOLDOWN` | `0.18` | 移动冷却 |
| `PLAYER_MOVE_TWEEN_DURATION` | `0.1` | 移动表现时长 |
| `PLAYER_PUSH_DISTANCE` | `1` | 初始推动距离 |
| `PLAYER_MAX_PUSH_DISTANCE` | `10` | 最大推动距离 |
| `PLAYER_DAMAGE_COOLDOWN` | `1.0` | 受伤无敌时间 |

备注：
- HP 现在跨关继承，不会每关回满
- 得分也会跨关累计

## 敌人数值

| 名称 | 值 | 含义 |
| --- | ---: | --- |
| `ENEMY_MOVE_INTERVAL_MIN` | `0.8` | 基础最短移动间隔 |
| `ENEMY_MOVE_INTERVAL_MAX` | `2.0` | 基础最长移动间隔 |

备注：
- 不同敌人会在这个基础上再乘不同系数

## 炸弹数值

| 名称 | 值 | 含义 |
| --- | ---: | --- |
| `BOMB_EXPLOSION_DELAY` | `4.5` | 旧延时常量，当前主要炸弹是碰撞触发 |
| `BOMB_EXPLOSION_RANGE` | `1` | 以中心向外 1 格，因此实际范围是 `3x3` |

## 通关条件

当前有两种胜利条件：

1. `hearts`
   将 3 个心心砖块推成横向或纵向连续

2. `enemies`
   敌人全灭

备注：
- 只要本关一开始确实生成过怪物，敌人全灭就能通关
- 两种通关都会进入下一关

## 分数规则

### 基础分数

| 名称 | 值 | 含义 |
| --- | ---: | --- |
| `SCORE_BLOCK_CRUSH` | `1000` | 用方块压死敌人 |
| `SCORE_BOMB_KILL` | `2000` | 炸弹炸死敌人 |
| `SCORE_YELLOW_ITEM` | `500` | 吃黄钻 |
| `SCORE_BLUE_ITEM` | `300` | 吃蓝钻 |
| `SCORE_BLOCK_BREAK` | `100` | 普通砖块碎裂 |
| `SCORE_STAR_BREAK` | `800` | 星星砖块碎裂 |
| `SCORE_HEART_MERGE` | `5000` | 心心集合通关额外奖励 |

### 额外通关奖励

每次通关都会额外获得：

`当前关卡序号 × 1000`

例如：
- 第 1 关通关：`+1000`
- 第 2 关通关：`+2000`
- 第 3 关通关：`+3000`

## 关卡命名

当前关卡名格式：

- `ROUND-01`
- `ROUND-02`
- `ROUND-03`

实际显示使用 `LEVELS[levelIndex].name`

## 资源命名参考

### 砖块资源

- `block`
- `star-block`
- `heart-block`
- `bomb-block`
- `wall`
- `floor`
- `grass`

单格贴图规则：

- `block` / `wall` / `grass` 这类单格美术资源，替换时必须先裁成严格 `48x48` 像素
- 不允许直接使用大图缩放充当单格贴图，避免出现越格覆盖

### 敌人资源

- `enemy-frog`
- `enemy-blue`
- `enemy-pink`
- `enemy-silver`
- `enemy-inactive`

### 道具资源

- `item-yellow`
- `item-blue`
- `push-powerup`

## 设计建议

后续如果你继续扩内容，建议优先保持这些表的一致性：

1. 怪物命名表
   名字、编号、贴图、行为要一起维护

2. 格子枚举表
   关卡编辑时最常用

3. 分数规则表
   后面做排行榜和平衡时会经常改

4. 掉落规则表
   后面加新砖块和新怪物时最容易忘
