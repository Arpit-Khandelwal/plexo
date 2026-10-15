import { expect, test } from '@playwright/test'
import {
  formatBytes,
  formatPercent,
  formatSpeed,
  speedTicks
} from '../src/renderer/src/utils/format'

const GiB = 1024 ** 3
const MiB = 1024 ** 2

test.describe('formatting @smoke', () => {
  test('a percentage reads 100 only once every byte is in', () => {
    expect(formatPercent(10 * GiB - 5 * MiB, 10 * GiB)).toBe(99)
    expect(formatPercent(999, 1000)).toBe(99)
    expect(formatPercent(1000, 1000)).toBe(100)
    expect(formatPercent(994, 1000)).toBe(99)
    expect(formatPercent(500, 1000)).toBe(50)
    expect(formatPercent(0, 0)).toBe(0)
  })

  test('less than a byte a second is still in bytes', () => {
    expect(formatBytes(0.5)).toBe('1 B')
    expect(formatSpeed(1 / 3, 'bytes')).toBe('0 B/s')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  test('a speed axis for a sub-byte speed is finite', () => {
    const { top, ticks } = speedTicks(0.5, 'bytes')
    expect(Number.isFinite(top)).toBe(true)
    expect(top).toBeGreaterThanOrEqual(0.5)
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) expect(tick.label).toMatch(/ B\/s$/)
  })
})
