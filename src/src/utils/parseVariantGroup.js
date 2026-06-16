const OPENS = { '(': ')', '[': ']', '<': '>', '{': '}' }

function topLevelSplitPositions(s, sep) {
    const positions = []
    let depth = 0
    for (let i = 0; i < s.length; i++) {
        const c = s[i]
        if (c === '\\') { i++; continue }
        if (c in OPENS) { depth++; continue }
        if (c === ')' || c === ']' || c === '>' || c === '}') {
            if (depth > 0) depth--
            continue
        }
        if (c === sep && depth === 0) positions.push(i)
    }
    return positions
}

function splitTopLevel(s, sep) {
    const pos = topLevelSplitPositions(s, sep)
    const parts = []
    let start = 0
    for (const p of pos) {
        parts.push(s.slice(start, p))
        start = p + 1
    }
    parts.push(s.slice(start))
    return parts
}

export function parseVariantGroup(token) {
    const tok = (token || '').trim()
    if (tok.length < 2 || tok[0] !== '{' || tok[tok.length - 1] !== '}') return null

    let depth = 0
    for (let i = 0; i < tok.length; i++) {
        const c = tok[i]
        if (c === '\\') { i++; continue }
        if (c === '{') depth++
        else if (c === '}') {
            depth--
            if (depth === 0 && i !== tok.length - 1) return null
        }
    }
    if (depth !== 0) return null

    let inner = tok.slice(1, -1)

    if (topLevelSplitPositions(inner, '|').length === 0) return null

    const groupMeta = { sigil: '', count: '', customSep: '' }
    if (inner[0] === '~' || inner[0] === '@') {
        groupMeta.sigil = inner[0]
        inner = inner.slice(1)
    }
    const cnt = inner.match(/^(\d+-\d+|-\d+|\d+-|\d+)\$\$/)
    if (cnt) {
        groupMeta.count = cnt[1]
        inner = inner.slice(cnt[0].length)
        const sep = inner.match(/^(.*?)\$\$/)
        const firstPipe = topLevelSplitPositions(inner, '|')[0]
        if (sep && (firstPipe === undefined || sep.index + sep[0].length <= firstPipe)) {
            groupMeta.customSep = sep[1]
            inner = inner.slice(sep[0].length)
        }
    }

    const options = splitTopLevel(inner, '|').map(optStr => {
        let weightMeta = ''
        const w = optStr.match(/^\s*([\d.]+)::/)
        if (w) {
            weightMeta = w[1]
            optStr = optStr.slice(w[0].length)
        }
        const leaves = splitTopLevel(optStr, ',')
            .map(v => v.trim())
            .filter(v => v !== '')
        return { weightMeta, leaves }
    })

    return { groupMeta, options }
}

export function serializeGroup(g, leafSep = ', ') {
    let meta = g.groupMeta.sigil || ''
    if (g.groupMeta.count) {
        meta += g.groupMeta.count + '$$'
        if (g.groupMeta.customSep) meta += g.groupMeta.customSep + '$$'
    }
    const opts = g.options.map(opt => {
        const w = opt.weightMeta ? opt.weightMeta + '::' : ''
        const leaves = opt.leaves.map(l => (typeof l === 'string' ? l : (l.value || ''))).join(leafSep)
        return w + leaves
    })
    return '{' + meta + opts.join('|') + '}'
}
