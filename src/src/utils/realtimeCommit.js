const OPENS = { '(': true, '[': true, '<': true, '{': true }
const CLOSES = { ')': true, ']': true, '>': true, '}': true }

export function segmentRanges(value) {
    const ranges = []
    let depth = 0
    let start = 0
    for (let i = 0; i < value.length; i++) {
        const c = value[i]
        if (c === '\\') { i++; continue }
        if (OPENS[c]) { depth++; continue }
        if (CLOSES[c]) { if (depth > 0) depth--; continue }
        if (c === ',' && depth === 0) {
            ranges.push({ start, end: i })
            start = i + 1
        }
    }
    ranges.push({ start, end: value.length })
    return ranges
}

export function activeSegment(value, caret) {
    const ranges = segmentRanges(value)
    for (const r of ranges) {
        if (caret >= r.start && caret <= r.end) return r
    }
    return ranges[ranges.length - 1]
}

export function computeStableValue(value, caret, prevState) {
    const seg = activeSegment(value, caret)
    const prefix = value.slice(0, seg.start)
    const suffix = value.slice(seg.end)
    const live = value.slice(seg.start, seg.end)

    let frozen
    if (prevState && prevState.prefix === prefix && prevState.suffix === suffix) {
        frozen = prevState.frozen
    } else {
        frozen = live
    }

    const stableValue = prefix + frozen + suffix
    return { stableValue, state: { prefix, suffix, frozen } }
}
