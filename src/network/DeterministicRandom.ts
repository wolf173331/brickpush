/**
 * DeterministicRandom - Mulberry32 PRNG
 * 保证相同种子在相同调用顺序下产生相同结果，用于 lockstep 同步
 */

export type RandomGenerator = () => number;

export interface Random {
  random: RandomGenerator;
  seed: number;
}

/** Mulberry32: 高质量、快速、小体积的确定性 PRNG */
export function seedRandom(seed: number): Random {
  let state = seed >>> 0;
  return {
    seed,
    random: (): number => {
      state |= 0;
      state = (state + 0x6D2B79F5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** 使用确定性 RNG 的 Fisher-Yates 洗牌 */
export function shuffleArray<T>(arr: T[], rng: RandomGenerator): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
