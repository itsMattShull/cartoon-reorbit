import { randomBytes } from 'node:crypto'

export function clampVariancePct(v) {
  const x = Number(v)
  if (!Number.isFinite(x)) return 0.12
  return Math.max(0, Math.min(x, 0.5))
}

function hexToU32(hex, offset) {
  return (parseInt(hex.slice(offset, offset + 8), 16) >>> 0)
}

function u32ToUnitFloat(u32) {
  return u32 / 4294967296
}

export function varyStat(base, rand01, variancePct) {
  const delta = (rand01 * 2 - 1) * variancePct
  const val = Math.round(Number(base) * (1 + delta))
  return Math.max(1, val)
}

export function rollInstanceStats(baseStats, variancePct) {
  const seed = randomBytes(32).toString('hex')

  const hpRand01 = u32ToUnitFloat(hexToU32(seed, 0))
  const atkRand01 = u32ToUnitFloat(hexToU32(seed, 8))
  const defRand01 = u32ToUnitFloat(hexToU32(seed, 16))

  return {
    seed,
    rolled: {
      hp: varyStat(baseStats.hp, hpRand01, variancePct),
      atk: varyStat(baseStats.atk, atkRand01, variancePct),
      def: varyStat(baseStats.def, defRand01, variancePct),
    },
  }
}
