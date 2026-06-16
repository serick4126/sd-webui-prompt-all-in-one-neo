# プロンプト表示エリアのリアルタイム更新 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロンプト入力中、タグ表示エリアを「ほぼリアルタイム」に更新しつつ、確定前トークンの伸縮による後続タグのリフローを起こさない。

**Architecture:** 入力中(textareaフォーカス中)だけ働く新しい `input` 経路を追加する。毎入力で「キャレットが乗るトップレベル・カンマ区切りセグメント=作業中」を特定し、そのセグメントを『入力開始時点の内容(スナップショット)』で凍結した文字列(`stableValue`)を生成、それを既存のタグ再構築に流して**書き戻しなしで表示だけ**を更新する。スナップショットはテキストを変えないキャレット移動(focus / クリック / 方向キー)時に取り直すため、編集前の内容で正しく凍結でき、キャレットがセグメントを離れた瞬間に確定描画される。最終的な確定(blur)で通常のフル更新(書き戻しあり)へ引き継ぐ。確定検知の中核は純関数 `computeStableValue` に切り出し、Vitest で単体テストする。

**Tech Stack:** Vue 3 (Options API, single-file component) / Vite 4 / 新規に Vitest を導入(純ロジックの単体テスト用)。

設計仕様: `docs/superpowers/specs/2026-06-16-realtime-tag-display-update-design.md`

---

## File Structure

作成・変更するファイルと責務。

- **作成** `src/src/utils/realtimeCommit.js` — 純関数モジュール。確定検知の中核。`segmentRanges` / `activeSegment` / `computeStableValue`。DOM・Vue非依存。
- **作成** `src/src/utils/__tests__/realtimeCommit.test.js` — 上記の Vitest 単体テスト。
- **作成** `src/vitest.config.js` — Vitest 設定(node環境)。
- **変更** `src/package.json` — `vitest` を devDependency に追加、`test` スクリプト追加。
- **変更** `src/src/components/phystonPrompt.vue` —
  - `_onTextareaChange` のタグ再構築部を `_rebuildTags(value)` へ抽出(挙動不変のリファクタ)。
  - 新メソッド `_onRealtimeInput`(入力=タイピング経路) / `_onCaretMove`(テキスト非変更のキャレット移動でスナップショット取り直し+確定描画) / `_onTextareaKeyup`(方向キー判定) / `_onCompositionStart` / `_onCompositionEnd` / `_onTextareaBlur` / `_refreshTagDisplayOnly` を追加。
  - `init()` で `input` / `compositionstart` / `compositionend` / `focus` / `mouseup` / `keyup` / `blur` リスナーを登録。
  - `data()` に `isComposing` / `realtimeState` / `_lastStableValue` を追加。
  - `beforeUnmount()` でリスナーを解除。
- **再生成(コミット対象)** `javascript/*.entry.js` / `javascript/*.chunk.js` / `style.css`(リポジトリルート)— `npm run build` の出力。

> 注: `phystonPrompt.vue` の行番号は編集に伴いずれるため、各ステップは周囲のコード片でアンカーする。

---

## Task 1: Vitest インフラ導入

**Files:**
- Modify: `src/package.json`
- Create: `src/vitest.config.js`
- Create: `src/src/utils/__tests__/sanity.test.js`(疎通確認用、最後に削除)

- [ ] **Step 1: `src/package.json` の scripts に test を追加**

`"preview": "vite preview"` の行を次のブロックに置き換える(末尾カンマに注意)。

```json
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: `src/package.json` の devDependencies に vitest を追加**

`"@vitejs/plugin-vue": "^4.0.0",` の直後に1行追加する。

```json
    "@vitejs/plugin-vue": "^4.0.0",
    "vitest": "^1.6.0",
```

- [ ] **Step 3: `src/vitest.config.js` を作成**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
})
```

- [ ] **Step 4: 疎通テストを作成**

`src/src/utils/__tests__/sanity.test.js`:

```js
import { describe, it, expect } from 'vitest'

describe('sanity', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: vitest をインストール**

`src/` ディレクトリで実行:

Run: `npm install`
Expected: 追加の依存解決エラーなく完了。`node_modules/.bin/vitest` が存在する。

- [ ] **Step 6: テストを実行して通ることを確認**

`src/` ディレクトリで実行:

Run: `npx vitest run`
Expected: PASS（1 test passed）。

- [ ] **Step 7: 疎通テストを削除**

`src/src/utils/__tests__/sanity.test.js` を削除する。

- [ ] **Step 8: コミット**

```bash
git add src/package.json src/package-lock.json src/vitest.config.js
git commit -m "chore(test): add vitest for unit testing pure logic"
```

---

## Task 2: セグメント範囲・作業中セグメントの算出(純関数・TDD)

トップレベル(括弧外)のカンマで分割した各セグメントの文字範囲を求め、キャレットが乗るセグメントを特定する。括弧 `() [] <> {}` 内のカンマと、バックスラッシュでエスケープされた文字は区切りにしない。未バランスの開き括弧はそのセグメントを末尾まで延長する。

**Files:**
- Create: `src/src/utils/realtimeCommit.js`
- Test: `src/src/utils/__tests__/realtimeCommit.test.js`

- [ ] **Step 1: 失敗するテストを書く**

`src/src/utils/__tests__/realtimeCommit.test.js`:

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/src/utils/__tests__/realtimeCommit.test.js`
Expected: FAIL（`Failed to resolve import "../realtimeCommit.js"` 等）。

- [ ] **Step 3: 最小実装を書く**

`src/src/utils/realtimeCommit.js`:

```js
const OPENS = { '(': true, '[': true, '<': true, '{': true }
const CLOSES = { ')': true, ']': true, '>': true, '}': true }

// トップレベル（括弧外）のカンマで区切った各セグメントの文字範囲を返す。
// バックスラッシュでエスケープされた次の1文字は無視する。
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

// キャレット位置を含むセグメント範囲を返す。
export function activeSegment(value, caret) {
    const ranges = segmentRanges(value)
    for (const r of ranges) {
        if (caret >= r.start && caret <= r.end) return r
    }
    return ranges[ranges.length - 1]
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run src/src/utils/__tests__/realtimeCommit.test.js`
Expected: PASS（8 tests passed）。

- [ ] **Step 5: コミット**

```bash
git add src/src/utils/realtimeCommit.js src/src/utils/__tests__/realtimeCommit.test.js
git commit -m "feat(utils): add segment range and active-segment detection"
```

---

## Task 3: 凍結スナップショットによる stableValue 算出(純関数・TDD)

作業中セグメントを「そのセグメントへキャレットが入った時点の内容」で凍結し、ライブ編集を無視した文字列 `stableValue` を生成する。前回呼び出しの prefix/suffix が一致する間は同一編集セッションとみなしてスナップショットを保持し、変化したら新セッションとして現在内容を捕捉し直す。

**Files:**
- Modify: `src/src/utils/realtimeCommit.js`
- Test: `src/src/utils/__tests__/realtimeCommit.test.js`

- [ ] **Step 1: 失敗するテストを追記**

`src/src/utils/__tests__/realtimeCommit.test.js` の先頭 import 行を次に差し替える。

```js
import { segmentRanges, activeSegment, computeStableValue } from '../realtimeCommit.js'
```

ファイル末尾に次の describe ブロックを追記する。

```js
describe('computeStableValue', () => {
  it('freezes the active segment to its content at entry (mid-prompt edit)', () => {
    // 1) " dog" セグメントにキャレットが入る（caret=11）
    let r = computeStableValue('outdoor, dog, mountain', 11, null)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
    // 2) 'o' を消す → "outdoor, dg, mountain"（caret=10）。表示は dog のまま凍結
    r = computeStableValue('outdoor, dg, mountain', 10, r.state)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
    // 3) 'i' を打つ → "outdoor, dig, mountain"（caret=11）。まだ凍結
    r = computeStableValue('outdoor, dig, mountain', 11, r.state)
    expect(r.stableValue).toBe('outdoor, dog, mountain')
  })

  it('commits the edit when the caret leaves the segment', () => {
    // " dog" を " dig" に直したあと、キャレットが " mountain" へ移動（caret=15）
    const prev = { prefix: 'outdoor,', suffix: ', mountain', frozen: ' dog' }
    const r = computeStableValue('outdoor, dig, mountain', 15, prev)
    expect(r.stableValue).toBe('outdoor, dig, mountain') // dig が確定して表示される
  })

  it('hides a new trailing token until a comma commits it', () => {
    let r = computeStableValue('cat, ', 5, null)
    expect(r.stableValue).toBe('cat, ')          // 末尾は空 → "cat" のみ
    r = computeStableValue('cat, w', 6, r.state)
    expect(r.stableValue).toBe('cat, ')           // 'w' は隠れる
    r = computeStableValue('cat, walking', 12, r.state)
    expect(r.stableValue).toBe('cat, ')           // まだ隠れる
    r = computeStableValue('cat, walking,', 13, r.state)
    expect(r.stableValue).toBe('cat, walking,')   // カンマで確定
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npx vitest run src/src/utils/__tests__/realtimeCommit.test.js`
Expected: FAIL（`computeStableValue is not a function`）。

- [ ] **Step 3: 最小実装を追記**

`src/src/utils/realtimeCommit.js` の末尾に追記する。

```js
// 作業中セグメントを凍結した stableValue と、次回判定用の state を返す。
// prevState: null | { prefix, suffix, frozen }
export function computeStableValue(value, caret, prevState) {
    const seg = activeSegment(value, caret)
    const prefix = value.slice(0, seg.start)
    const suffix = value.slice(seg.end)
    const live = value.slice(seg.start, seg.end)

    let frozen
    if (prevState && prevState.prefix === prefix && prevState.suffix === suffix) {
        // 同一編集セッション: 入った時点のスナップショットを保持
        frozen = prevState.frozen
    } else {
        // 別セグメントへ移った / 周囲が変わった: 現在内容を新スナップショットに
        frozen = live
    }

    const stableValue = prefix + frozen + suffix
    return { stableValue, state: { prefix, suffix, frozen } }
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npx vitest run src/src/utils/__tests__/realtimeCommit.test.js`
Expected: PASS（11 tests passed）。

- [ ] **Step 5: コミット**

```bash
git add src/src/utils/realtimeCommit.js src/src/utils/__tests__/realtimeCommit.test.js
git commit -m "feat(utils): add frozen-snapshot stableValue computation"
```

---

## Task 4: `_rebuildTags(value)` の抽出(挙動不変リファクタ)

`_onTextareaChange` のタグ再構築部分を、書き戻しを伴わず再利用できるメソッドへ切り出す。挙動は変えない。

**Files:**
- Modify: `src/src/components/phystonPrompt.vue`(`_onTextareaChange` 内、`let value = this.textarea.value.trim()` 以降)

- [ ] **Step 1: `_onTextareaChange` の本体を `_rebuildTags` 呼び出しに置き換える**

`_onTextareaChange(event)` 内の、`let value = this.textarea.value.trim()` から `for` ループ終端(`this.tags` を組み立て終える `}`)までのブロック、具体的には次の現行コード:

```js
            let value = this.textarea.value.trim()
            if (value === this.prompt.trim()) return
            let tags = common.splitTags(value, this.autoBreakBeforeWrap, this.autoBreakAfterWrap)

            let disabledTags = []
            this.tags.forEach((tag, index) => {
                if (tag.disabled) {
                    disabledTags.push({tag, index})
                }
            })
            disabledTags.forEach(({tag, index}) => {
                // 插入到 tags 中
                tags.splice(index, 0, tag.value)
            })

            let indexes = []
            let oldTags = this.tags
            this.tags = []
            for (let index in tags) {
                let tag = tags[index]
                if (tag === "\n") {
                    this._appendTag("\n", "\n", false, -1, 'wrap')
                } else if (this.enableVariantGroupSplit) {
                    const parsed = parseVariantGroup(tag)
                    if (parsed) {
                        let find = false
                        for (let item of oldTags) {
                            if (item.isVariantGroup && item.value === tag) {
                                find = item
                                break
                            }
                        }
                        if (find) {
                            this.tags.push(find)
                        } else {
                            this._appendGroupTag(parsed, -1)
                        }
                    } else {
                        let find = false
                        for (let item of oldTags) {
                            if (item.value === tag) {
                                find = item
                                break
                            }
                        }
                        const localValue = find ? find.localValue : ''
                        const disabled = find ? find.disabled : false
                        const index = this._appendTag(tag, localValue, disabled, -1, 'text')
                        if (!find && index !== -1) indexes.push(index)
                    }
                } else {
                    let find = false
                    for (let item of oldTags) {
                        if (item.value === tag) {
                            find = item
                            break
                        }
                    }
                    const localValue = find ? find.localValue : ''
                    const disabled = find ? find.disabled : false
                    const index = this._appendTag(tag, localValue, disabled, -1, 'text')
                    if (!find && index !== -1) indexes.push(index)
                }
            }
```

を、次の2行に置き換える(先頭の早期 return ガードはそのまま残す)。

```js
            let value = this.textarea.value.trim()
            if (value === this.prompt.trim()) return
            const indexes = this._rebuildTags(value)
```

- [ ] **Step 2: `_rebuildTags(value)` メソッドを新規追加**

`_onTextareaChange(event) { ... }` メソッドの直後(閉じ `}` と次メソッドの間)に、次のメソッドを追加する。中身は Step 1 で取り除いたロジックそのものに `return indexes` を付けたもの。

```js
        _rebuildTags(value) {
            let tags = common.splitTags(value, this.autoBreakBeforeWrap, this.autoBreakAfterWrap)

            let disabledTags = []
            this.tags.forEach((tag, index) => {
                if (tag.disabled) {
                    disabledTags.push({tag, index})
                }
            })
            disabledTags.forEach(({tag, index}) => {
                tags.splice(index, 0, tag.value)
            })

            let indexes = []
            let oldTags = this.tags
            this.tags = []
            for (let index in tags) {
                let tag = tags[index]
                if (tag === "\n") {
                    this._appendTag("\n", "\n", false, -1, 'wrap')
                } else if (this.enableVariantGroupSplit) {
                    const parsed = parseVariantGroup(tag)
                    if (parsed) {
                        let find = false
                        for (let item of oldTags) {
                            if (item.isVariantGroup && item.value === tag) {
                                find = item
                                break
                            }
                        }
                        if (find) {
                            this.tags.push(find)
                        } else {
                            this._appendGroupTag(parsed, -1)
                        }
                    } else {
                        let find = false
                        for (let item of oldTags) {
                            if (item.value === tag) {
                                find = item
                                break
                            }
                        }
                        const localValue = find ? find.localValue : ''
                        const disabled = find ? find.disabled : false
                        const idx = this._appendTag(tag, localValue, disabled, -1, 'text')
                        if (!find && idx !== -1) indexes.push(idx)
                    }
                } else {
                    let find = false
                    for (let item of oldTags) {
                        if (item.value === tag) {
                            find = item
                            break
                        }
                    }
                    const localValue = find ? find.localValue : ''
                    const disabled = find ? find.disabled : false
                    const idx = this._appendTag(tag, localValue, disabled, -1, 'text')
                    if (!find && idx !== -1) indexes.push(idx)
                }
            }
            return indexes
        },
```

> 注: 元コードは内側 `else` ブロック(ネストブロック)で `const index` を宣言して外側 `for...in` の `index` を合法的にシャドウしていた。抽出版では可読性のため内側を `idx` に改名しているだけで、挙動は完全に不変。

- [ ] **Step 3: ビルドが通ることを確認**

`src/` ディレクトリで実行:

Run: `npm run build`
Expected: ビルド成功（エラーなく `../javascript/*.entry.js` 等が生成される）。

- [ ] **Step 4: 手動確認（リファクタの非回帰）**

webui を起動し、対象テキストエリアを編集してフォーカスを外す（または別要素をクリック）。従来どおりタグ表示が更新され、textarea が再整形されること。バリアントグループ `{a|b}` や無効化タグが従来どおり表示されること。

- [ ] **Step 5: コミット（ソースのみ。bundle は Task 7 でまとめて再生成）**

```bash
git add src/src/components/phystonPrompt.vue
git commit -m "refactor(vue): extract _rebuildTags from _onTextareaChange"
```

---

## Task 5: リアルタイム入力経路の追加(表示のみ・IME対応)

フォーカス中の `input` で `computeStableValue` を使い、書き戻しなしでタグ表示だけを更新する。IME 変換中は抑止し、`compositionend` で1回反映する。

**Files:**
- Modify: `src/src/components/phystonPrompt.vue`(`data()` / `init()` / `methods`)

- [ ] **Step 1: import に `computeStableValue` を追加**

現行の import 行:

```js
import { parseVariantGroup, serializeGroup } from "@/utils/parseVariantGroup"
```

の直後に追加する。

```js
import { computeStableValue } from "@/utils/realtimeCommit"
```

- [ ] **Step 2: `data()` に状態フィールドを追加**

`data()` の `tags: [],` の直後に追加する。

```js
            tags: [],

            isComposing: false,
            realtimeState: null,
            _lastStableValue: null,
```

- [ ] **Step 3: `init()` のコメントアウトされたリスナー枠を実リスナー登録に置き換える**

`init()` 内の現行の次の4行(コメント):

```js
                // this.textarea.removeEventListener('change', this.onTextareaChange)
                // this.textarea.addEventListener('change', this.onTextareaChange)
                // this.textarea.removeEventListener('blur', this.onTextareaChange)
                // this.textarea.addEventListener('blur', this.onTextareaChange)
```

を次に置き換える。

```js
                this.textarea.addEventListener('input', this._onRealtimeInput)
                this.textarea.addEventListener('compositionstart', this._onCompositionStart)
                this.textarea.addEventListener('compositionend', this._onCompositionEnd)
                this.textarea.addEventListener('focus', this._onCaretMove)
                this.textarea.addEventListener('mouseup', this._onCaretMove)
                this.textarea.addEventListener('keyup', this._onTextareaKeyup)
                this.textarea.addEventListener('blur', this._onTextareaBlur)
```

> Vue (Options API) のメソッドはインスタンスにバインド済みなので、同じ参照で `removeEventListener` できる(Task 6 で解除)。
> `input`(タイピング)はスナップショットを取り直さず、直前にキャレット移動で確定したスナップショットを保持する。`focus`/`mouseup`/方向キーの `keyup` だけがスナップショットを取り直す。これにより「編集前の内容で凍結」と「キャレット離脱で即確定」を両立する。

- [ ] **Step 4: 新メソッド群を追加**

`_rebuildTags(value) { ... }`(Task 4 で追加)の直後に、次のメソッド群を追加する。

```js
        _onRealtimeInput() {
            // IME 変換中は触らない
            if (this.isComposing) return
            // フォーカスが textarea にある間だけ（=ユーザー入力中）動く
            if (document.activeElement !== this.textarea) return
            // オートコンプリートのドロップダウンが開いている間は触らない（既存挙動に合わせる）
            const autocompleteParent = this.textarea.parentElement.getElementsByClassName('autocompleteParent')
            if (autocompleteParent.length) {
                if (autocompleteParent[0].style.display !== 'none') return
            } else {
                const autocompleteResults = this.textarea.parentElement.getElementsByClassName('autocompleteResults')
                if (autocompleteResults.length > 0) {
                    if (autocompleteResults[0].style.display !== 'none') return
                }
            }

            const value = this.textarea.value
            const caret = this.textarea.selectionStart
            // realtimeState は直前のキャレット移動(_onCaretMove)で確定済みのスナップショット。
            // タイピング中はこれを保持し、編集前の内容で凍結する。
            const { stableValue, state } = computeStableValue(value, caret, this.realtimeState)
            this.realtimeState = state

            // 確定済み集合が前回と同一なら DOM を触らない（リフロー封じ・性能ガード）
            if (stableValue === this._lastStableValue) return
            this._lastStableValue = stableValue

            this._rebuildTags(stableValue.trim())
            this._refreshTagDisplayOnly()
        },
        _onCaretMove() {
            // テキストを変えないキャレット移動(focus / クリック / 方向キー)。
            // 新しいセグメントの内容を「編集前スナップショット」として取り直し、
            // 直前まで凍結していたセグメントを確定表示する。
            if (this.isComposing) return
            if (document.activeElement !== this.textarea) return
            const value = this.textarea.value
            const caret = this.textarea.selectionStart
            // prevState=null で現在セグメントを新スナップショットとして捕捉
            this.realtimeState = computeStableValue(value, caret, null).state
            // 取り直したスナップショットで再描画（離脱したセグメントが確定する）
            this._onRealtimeInput()
        },
        _onTextareaKeyup(e) {
            // 方向キー等のキャレット移動キーだけを _onCaretMove に流す。
            // 文字キーの keyup は input で処理済みなので無視する（スナップショットを壊さない）。
            const navKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']
            if (navKeys.includes(e.key)) this._onCaretMove()
        },
        _onCompositionStart() {
            this.isComposing = true
        },
        _onCompositionEnd() {
            this.isComposing = false
            this._onRealtimeInput()
        },
        _onTextareaBlur() {
            // 入力セッション終了。次のフル更新が確定状態から再構築できるようリセット
            this.realtimeState = null
            this._lastStableValue = null
            // 末尾の作業中トークンも確定させ、textarea 書き戻しを行うフル更新へ引き継ぐ
            this.onTextareaChange(true)
        },
        _refreshTagDisplayOnly() {
            // 書き戻し・トークン計数・履歴は行わず、wrap(改行)タグの並びだけ整える。
            this.$nextTick(() => {
                if (!this.$refs.promptTagsList) return
                for (let i = 0; i < this.$refs.promptTagsList.children.length; i++) {
                    let tag = this.$refs.promptTagsList.children[i]
                    if (!tag.classList.contains('prompt-tag')) continue
                    let id = tag.getAttribute('data-id')
                    let wrap = (this.$refs.promptTagWrap || []).find(wrap => {
                        return wrap.getAttribute('data-id') === id
                    })
                    if (wrap) tag.parentNode.insertBefore(wrap, tag.nextElementSibling)
                }
            })
        },
```

- [ ] **Step 5: ビルドが通ることを確認**

`src/` ディレクトリで実行:

Run: `npm run build`
Expected: ビルド成功。

- [ ] **Step 6: 手動確認（リアルタイム表示・リフロー封じ・IME）**

webui を起動して確認する:
1. 末尾に `, walking` と打つ。`walking` のチップは出ず、カンマを打った瞬間に `walking` タグが現れる。
2. `outdoor, dog, mountain` の `dog` を `dig` に直す。編集中チップは `dog` のまま残り、カーソルを隣のセグメントへ動かす/別所をクリックした瞬間 `dig` に変わる。後続タグ(`mountain`)が1文字ごとにずれない。
3. 日本語IMEで変換中はタグが増減せず、変換確定(Enter)で1回だけ反映される。

- [ ] **Step 7: コミット（ソースのみ）**

```bash
git add src/src/components/phystonPrompt.vue
git commit -m "feat(vue): realtime tag display update during typing"
```

---

## Task 6: リスナー解除(アンマウント時のクリーンアップ)

コンポーネント破棄時にtextareaへ付けたリスナーを外し、リーク・多重登録を防ぐ。

**Files:**
- Modify: `src/src/components/phystonPrompt.vue`(`methods` と同階層に `beforeUnmount` フックを追加)

- [ ] **Step 1: `beforeUnmount` フックを追加**

`data() { ... },` ブロックの直後(`methods: {` の直前)に、次のライフサイクルフックを追加する。

```js
    beforeUnmount() {
        if (this.textarea) {
            this.textarea.removeEventListener('input', this._onRealtimeInput)
            this.textarea.removeEventListener('compositionstart', this._onCompositionStart)
            this.textarea.removeEventListener('compositionend', this._onCompositionEnd)
            this.textarea.removeEventListener('focus', this._onCaretMove)
            this.textarea.removeEventListener('mouseup', this._onCaretMove)
            this.textarea.removeEventListener('keyup', this._onTextareaKeyup)
            this.textarea.removeEventListener('blur', this._onTextareaBlur)
        }
    },
```

- [ ] **Step 2: ビルドが通ることを確認**

`src/` ディレクトリで実行:

Run: `npm run build`
Expected: ビルド成功。

- [ ] **Step 3: 手動確認**

webui を開き、UIタブを切り替える等でコンポーネントの再生成が起きても、リアルタイム更新が二重に走らない(1文字でタグが二重更新されない)こと。

- [ ] **Step 4: コミット（ソースのみ）**

```bash
git add src/src/components/phystonPrompt.vue
git commit -m "fix(vue): remove realtime listeners on unmount"
```

---

## Task 7: バンドル再生成と最終コミット

リポジトリは `npm run build` の出力(`javascript/*.entry.js` 等)をコミットして配布している。ソース変更をビルド成果物へ反映する。

**Files:**
- Regenerate: `javascript/*.entry.js` / `javascript/*.chunk.js` / `style.css`(リポジトリルート)

- [ ] **Step 1: 全テストを通す**

`src/` ディレクトリで実行:

Run: `npx vitest run`
Expected: PASS（realtimeCommit のテストが全て通る）。

- [ ] **Step 2: 本番ビルド**

`src/` ディレクトリで実行:

Run: `npm run build`
Expected: ビルド成功。`git status` でリポジトリルートの `javascript/` 配下と `style.css` に差分が出る。

- [ ] **Step 3: 生成物を確認してコミット**

```bash
git add javascript style.css
git commit -m "chore(build): rebuild bundle for realtime tag display update"
```

---

## 注記 / 非対応(設計仕様 §3, §11 に準拠)

- 入力中の textarea への書き戻しは意図的に行わない(blur 時のフル更新で実施)。
- リアルタイム更新の ON/OFF トグル UI は実装しない(既定で有効)。
- 編集中チップの視覚的ヒント(枠色等)は対象外。
- 既存の 500ms ポーリング(フォーカス外/外部書き換え用)はそのまま維持し、新 `input` 経路と住み分ける。
