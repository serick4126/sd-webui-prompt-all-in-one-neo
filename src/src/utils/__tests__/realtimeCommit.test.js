import { describe, it, expect } from 'vitest'
import { segmentRanges, activeSegment, computeStableValue } from '../realtimeCommit.js'

describe('segmentRanges', () => {
  it('splits on top-level commas', () => {
    expect(segmentRanges('cat, dog, bird')).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 8 },
      { start: 9, end: 14 },
    ])
  })
  it('ignores commas inside parentheses', () => {
    expect(segmentRanges('(a, b), c')).toEqual([
      { start: 0, end: 6 },
      { start: 7, end: 9 },
    ])
  })
  it('ignores commas inside braces (variant group)', () => {
    expect(segmentRanges('{a|b,c}, x')).toEqual([
      { start: 0, end: 7 },
      { start: 8, end: 10 },
    ])
  })
  it('respects backslash escapes', () => {
    expect(segmentRanges('a\\,b, c')).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 7 },
    ])
  })
  it('treats an unbalanced open bracket as extending to end', () => {
    expect(segmentRanges('a, {b|c')).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 7 },
    ])
  })
})

describe('activeSegment', () => {
  it('returns the segment containing the caret', () => {
    expect(activeSegment('cat, dog, bird', 6)).toEqual({ start: 4, end: 8 })
  })
  it('caret at the very end belongs to the trailing segment', () => {
    expect(activeSegment('cat, ', 5)).toEqual({ start: 4, end: 5 })
  })
  it('caret right before a comma stays in the current segment', () => {
    expect(activeSegment('cat, dog', 3)).toEqual({ start: 0, end: 3 })
  })
})

describe('computeStableValue', () => {
  it('freezes the active segment to its content at entry (mid-prompt edit)', () => {
    let r = computeStableValue('outdoor, dog, mountain', 11, null)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
    r = computeStableValue('outdoor, dg, mountain', 10, r.state)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
    r = computeStableValue('outdoor, dig, mountain', 11, r.state)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
  })

  it('commits the edit when the caret leaves the segment', () => {
    const prev = { prefix: 'outdoor,', suffix: ', mountain', frozen: ' dog' }
    const r = computeStableValue('outdoor, dig, mountain', 15, prev)
    expect(r.stableValue).toBe('outdoor, dig, mountain')
  })

  it('hides a new trailing token until a comma commits it', () => {
    let r = computeStableValue('cat, ', 5, null)
    expect(r.stableValue).toBe('cat, ')
    r = computeStableValue('cat, w', 6, r.state)
    expect(r.stableValue).toBe('cat, ')
    r = computeStableValue('cat, walking', 12, r.state)
    expect(r.stableValue).toBe('cat, ')
    r = computeStableValue('cat, walking,', 13, r.state)
    expect(r.stableValue).toBe('cat, walking,')
  })
})
