// Manual test script for parseVariantGroup.js
// Run: node src/tests/parseVariantGroup.test.mjs

import { parseVariantGroup, serializeGroup } from '../src/utils/parseVariantGroup.js'

let passed = 0
let failed = 0

function assert(condition, msg) {
    if (condition) { passed++; return true }
    console.error('  FAIL:', msg)
    failed++
    return false
}

function test(name, fn) {
    console.log('\n' + name)
    try {
        fn()
    } catch (e) {
        console.error('  ERROR:', e.message)
        failed++
    }
}

// ---- Detection: should parse ----
test('basic: {a|b|c}', () => {
    const r = parseVariantGroup('{a|b|c}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.sigil === '', 'sigil empty')
    assert(r.groupMeta.count === '', 'count empty')
    assert(r.options.length === 3, '3 options')
    assert(r.options[0].leaves[0] === 'a', 'first leaf a')
    assert(r.options[1].leaves[0] === 'b', 'second leaf b')
    assert(r.options[2].leaves[0] === 'c', 'third leaf c')
})

test('comma leaves: {a,b,c|d,e,f}', () => {
    const r = parseVariantGroup('{a,b,c|d,e,f}')
    assert(r !== null, 'should not be null')
    assert(r.options.length === 2, '2 options')
    assert(r.options[0].leaves.length === 3, '3 leaves in opt0')
    assert(r.options[0].leaves[0] === 'a', 'leaf a')
    assert(r.options[0].leaves[1] === 'b', 'leaf b')
    assert(r.options[0].leaves[2] === 'c', 'leaf c')
    assert(r.options[1].leaves[0] === 'd', 'leaf d')
})

test('sigil: {~a|b}', () => {
    const r = parseVariantGroup('{~a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.sigil === '~', 'sigil ~')
    assert(r.options.length === 2, '2 options')
})

test('sigil: {@a|b}', () => {
    const r = parseVariantGroup('{@a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.sigil === '@', 'sigil @')
})

test('count: {2$$a|b|c}', () => {
    const r = parseVariantGroup('{2$$a|b|c}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.count === '2', 'count 2')
    assert(r.options.length === 3, '3 options')
})

test('count range: {1-2$$a|b}', () => {
    const r = parseVariantGroup('{1-2$$a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.count === '1-2', 'count 1-2')
})

test('count range: {-2$$a|b}', () => {
    const r = parseVariantGroup('{-2$$a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.count === '-2', 'count -2')
})

test('count range: {2-$$a|b}', () => {
    const r = parseVariantGroup('{2-$$a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.count === '2-', 'count 2-')
})

test('custom sep: {2$$ and $$a|b}', () => {
    const r = parseVariantGroup('{2$$ and $$a|b}')
    assert(r !== null, 'should not be null')
    assert(r.groupMeta.count === '2', 'count 2')
    assert(r.groupMeta.customSep === ' and ', 'customSep " and "')
})

test('weight: {0.5::a|0.3::b}', () => {
    const r = parseVariantGroup('{0.5::a|0.3::b}')
    assert(r !== null, 'should not be null')
    assert(r.options[0].weightMeta === '0.5', 'weight 0.5')
    assert(r.options[1].weightMeta === '0.3', 'weight 0.3')
})

test('nested: {a|{b|c}|d}', () => {
    const r = parseVariantGroup('{a|{b|c}|d}')
    assert(r !== null, 'should not be null')
    assert(r.options.length === 3, '3 options')
    assert(r.options[1].leaves[0] === '{b|c}', 'nested {b|c} kept as leaf')
})

// ---- Detection: should NOT parse ----
test('no pipe: {tag}', () => {
    const r = parseVariantGroup('{tag}')
    assert(r === null, 'should be null')
})

test('variable: ${var=value}', () => {
    const r = parseVariantGroup('${var=value}')
    assert(r === null, 'should be null')
})

test('nested variable: ${color={red|blue|green}}', () => {
    const r = parseVariantGroup('${color={red|blue|green}}')
    assert(r === null, 'should be null (starts with $)')
})

test('wrap: %{wrapper ...$$x}', () => {
    const r = parseVariantGroup('%{wrapper ...$$x}')
    assert(r === null, 'should be null')
})

test('wildcard: __wild__', () => {
    const r = parseVariantGroup('__wild__')
    assert(r === null, 'should be null')
})

test('parenthesized group: ({a|b}:1.2)', () => {
    const r = parseVariantGroup('({a|b}:1.2)')
    assert(r === null, 'should be null (starts with ()')
})

test('bracketed group: [{a|b}]', () => {
    const r = parseVariantGroup('[{a|b}]')
    assert(r === null, 'should be null (starts with [)')
})

test('escaped pipe: {a\\|b}', () => {
    const r = parseVariantGroup('{a\\|b}')
    assert(r === null, 'should be null (escaped | not counted)')
})

test('unbalanced: {a|b', () => {
    const r = parseVariantGroup('{a|b')
    assert(r === null, 'should be null')
})

test('single char: {', () => {
    const r = parseVariantGroup('{')
    assert(r === null, 'should be null')
})

test('empty string', () => {
    const r = parseVariantGroup('')
    assert(r === null, 'should be null')
})

// ---- Round-trip ----
test('round-trip: {a|b|c}', () => {
    const r = parseVariantGroup('{a|b|c}')
    const s = serializeGroup(r)
    assert(s === '{a|b|c}', 'round-trip: ' + s)
})

test('round-trip with sigil: {~a|b}', () => {
    const r = parseVariantGroup('{~a|b}')
    const s = serializeGroup(r)
    assert(s === '{~a|b}', 'round-trip sigil: ' + s)
})

test('round-trip with count: {2$$a|b}', () => {
    const r = parseVariantGroup('{2$$a|b}')
    const s = serializeGroup(r)
    assert(s === '{2$$a|b}', 'round-trip count: ' + s)
})

test('round-trip with weight: {0.5::a|0.3::b}', () => {
    const r = parseVariantGroup('{0.5::a|0.3::b}')
    const s = serializeGroup(r)
    assert(s === '{0.5::a|0.3::b}', 'round-trip weight: ' + s)
})

test('round-trip with comma leaves: {a,b|c,d}', () => {
    const r = parseVariantGroup('{a,b|c,d}')
    const s = serializeGroup(r, ',')
    assert(s === '{a,b|c,d}', 'round-trip comma no-space: ' + s)
})

test('round-trip with comma leaves (default sep): {a,b|c,d}', () => {
    const r = parseVariantGroup('{a,b|c,d}')
    const s = serializeGroup(r)
    assert(s === '{a, b|c, d}', 'round-trip comma with space: ' + s)
})

test('round-trip with custom sep: {2$$ and $$a|b}', () => {
    const r = parseVariantGroup('{2$$ and $$a|b}')
    const s = serializeGroup(r)
    assert(s === '{2$$ and $$a|b}', 'round-trip custom sep: ' + s)
})

console.log('\n=== Results ===')
console.log('Passed:', passed)
console.log('Failed:', failed)
if (failed > 0) process.exit(1)
