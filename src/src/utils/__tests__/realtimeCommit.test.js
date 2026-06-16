import { describe, it, expect } from 'vitest'
import { segmentRanges, activeSegment } from '../realtimeCommit.js'

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
