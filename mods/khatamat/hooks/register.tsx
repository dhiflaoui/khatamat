import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { QuranVerse } from '../types'

const PANE = 'khatamat'
const STORE_KEY = 'index'

// The verse shown now, as a position in the list. -1 means none shown yet,
// so the first popup shows 1:1.
const index = atom({ plugin: 'khatamat', key: 'index' } as const, -1)

// Module state: rebuilt on every load (session.start runs again on a reload).
let verses: readonly QuranVerse[] = []
let translations: readonly string[] = []
let showTranslation = true
let loading: Promise<void> | undefined
let tick: Timer | undefined
let poll: Timer | undefined
let closer: Timer | undefined
let toastMs = 60_000
let wordsPerLine = 9
const POPUP_ROWS = 8
const MAX_POPUP_ROWS = 18
// Tarteel QUL "Imlaei Script - Ayah by ayah": standard spelling with harakat.
const DATA_FILE = 'data/quran-imlaei.json'
// Tarteel QUL "Saheeh International" (resource 193), one string per verse, same order as DATA_FILE.
const EN_FILE = 'data/quran-en.json'
const EN_CHARS_PER_ROW = 70

// The On/Off switch of the Mods pane (/mods): "khatamat": false in
// <config>/mods/switches.json turns the popups off in every chat.
const NAME = 'khatamat'
const SWITCH_POLL_MS = 3000
let off = false
let configDir = ''

async function findConfigDir($: EngineInterface): Promise<string> {
  if (configDir) return configDir
  const home = ((await $.env.get('HOME').catch(() => undefined)) ?? '').trim()
  const set = ((await $.env.get('CLAUDE_CONFIG_DIR').catch(() => undefined)) ?? '').trim()
  const expanded = set === '~' ? home : set.startsWith('~/') ? `${home}${set.slice(1)}` : set
  configDir = (expanded || `${home}/.claude`).replace(/\/+$/, '')
  return configDir
}

async function readOff($: EngineInterface): Promise<boolean> {
  try {
    const path = `${await findConfigDir($)}/mods/switches.json`
    if (!(await $.fs.exists(path))) return false
    const json = JSON.parse(String(await $.fs.read(path))) as unknown
    return !!json && typeof json === 'object' && (json as Record<string, unknown>)[NAME] === false
  } catch {
    return off
  }
}

function cancelCloser(): void {
  closer?.cancel()
  closer = undefined
}

// Turned off: take the popup down.
async function syncSwitch($: EngineInterface): Promise<void> {
  const now = await readOff($)
  if (now && !off) {
    cancelCloser()
    await $.ui.close({ id: PANE }).catch(() => undefined)
  }
  off = now
}

function load($: EngineInterface): Promise<void> {
  loading ??= (async () => {
    try {
      const parsed = JSON.parse(await $.fs.read(`${$.plugin.root}/${DATA_FILE}`)) as unknown
      if (!Array.isArray(parsed)) throw new Error('not an array')
      verses = parsed as QuranVerse[]
    } catch {
      verses = []
      translations = []
      $.ui.log(`khatamat: could not read ${DATA_FILE}`)
      return
    }
    // Translation turned off: do not read the file at all.
    if (!showTranslation) {
      translations = []
      return
    }
    try {
      const en = JSON.parse(await $.fs.read(`${$.plugin.root}/${EN_FILE}`)) as unknown
      if (!Array.isArray(en)) throw new Error('not an array')
      if (en.length !== verses.length) throw new Error(`length ${en.length}, expected ${verses.length}`)
      if (!en.every(x => typeof x === 'string')) throw new Error('not all strings')
      translations = en as string[]
    } catch (err) {
      translations = []
      $.ui.log(`khatamat: could not read ${EN_FILE} (${err instanceof Error ? err.message : String(err)})`)
    }
  })()
  return loading
}

function wrap(i: number): number {
  const n = verses.length
  return n === 0 ? 0 : ((i % n) + n) % n
}

// The English translation of verse position i, or undefined when it is off or not loaded.
function english(i: number): string | undefined {
  return showTranslation ? translations[wrap(i)] : undefined
}

// Move by `step` verses (wrapping at both ends) and remember it across sessions.
async function move($: EngineInterface, step: number): Promise<void> {
  await load($)
  if (verses.length === 0) return
  await update($, index, i => wrap((i < 0 ? -1 : i) + step))
  await $.store.set(STORE_KEY, await read($, index))
}

// Previous/Next: move, then open the same pane again so its height fits the
// new verse (each open sets rows anew; it never makes a second pane).
async function stepPane($: EngineInterface, step: number): Promise<void> {
  await move($, step)
  const i = await read($, index)
  const v = verses[wrap(i)]
  if (v === undefined) return
  await $.ui.open({ id: PANE, title: 'Quran', rows: paneRows(v, english(i)) }).catch(() => undefined)
}

// The info line, Arabic only so it reads right to left in one order.
function header(v: QuranVerse): string {
  return `سورة ${v.chapter_ar} · الآية ${v.verse}`
}

// The verse for display. The app draws Arabic with DejaVu Sans / Arial (mods
// cannot choose a font), which lack the waqf marks, so those are dropped; the
// harakat and the dagger alef are kept.
function readable(text: string): string {
  return text.replace(/[\u06D6-\u06DC]/g, '').replace(/ {2,}/g, ' ').trim()
}

// Split the verse into balanced lines of at most wordsPerLine words, so no line
// ends on a lone word. Text has no line-height, so separate lines give both the
// spacing and true centering. Each line keeps the original (logical) word order.
function lines(text: string): string[] {
  const words = readable(text).split(' ').filter(Boolean)
  const n = words.length
  const k = Math.max(1, Math.ceil(n / wordsPerLine))
  const big = Math.ceil(n / k)
  const small = Math.floor(n / k)
  const out: string[] = []
  let at = 0
  for (let i = 0; i < k && at < n; i++) {
    const size = i < n % k ? big : small
    out.push(words.slice(at, at + size).join(' '))
    at += size
  }
  return out
}

// Rows the pane asks for: one per verse line plus a gap before each, and the
// header, buttons and outer gaps, plus the estimated English rows and their gap.
// Anything taller than the cap scrolls.
function paneRows(v: QuranVerse, en: string | undefined): number {
  const enRows = en ? Math.ceil(en.length / EN_CHARS_PER_ROW) + 1 : 0
  return Math.min(MAX_POPUP_ROWS, Math.max(POPUP_ROWS, lines(v.text).length * 2 + 5 + enRows))
}

async function current($: EngineInterface): Promise<QuranVerse | undefined> {
  await load($)
  if (verses.length === 0) return undefined
  return verses[wrap(await read($, index))]
}

// The interval: advance one verse and show it in a popup pane that closes by
// itself; when the pane cannot be drawn, fall back to a toast.
async function popupNext($: EngineInterface): Promise<void> {
  if (off) return
  await move($, 1)
  const v = await current($)
  if (v === undefined) return
  cancelCloser()
  const r = await $.ui.open({ id: PANE, title: 'Quran', rows: paneRows(v, english(await read($, index))) })
  if (r.isPlaced) {
    closer = $.clock.after(toastMs, () => void $.ui.close({ id: PANE }).catch(() => {}))
    return
  }
  await $.ui.close({ id: PANE }).catch(() => {})
  $.ui.toast(`📖 ${header(v)} — ${readable(v.text)}`.slice(0, 2000), { timeoutMs: toastMs })
}

// /quran: open the widget on the current verse (the last one shown).
async function openWidget($: EngineInterface): Promise<string> {
  if (off) return 'khatamat is turned off in /mods.'
  await load($)
  if (verses.length === 0) {
    return `khatamat: no verses loaded (${DATA_FILE} missing or unreadable).`
  }
  if ((await read($, index)) < 0) {
    await update($, index, () => 0)
    await $.store.set(STORE_KEY, 0)
  }
  const v = await current($)
  if (v === undefined) {
    return `khatamat: no verses loaded (${DATA_FILE} missing or unreadable).`
  }
  cancelCloser()
  const r = await $.ui.open({ id: PANE, title: 'Quran', rows: paneRows(v, english(await read($, index))) })
  return r.isPlaced ? `Quran widget: ${header(v)}` : `Quran widget opened but not shown: ${r.reason}`
}

async function restore($: EngineInterface): Promise<void> {
  await load($)
  const saved = await $.store.get(STORE_KEY)
  if (typeof saved === 'number') {
    await update($, index, () => wrap(saved))
  }
}

export const register: Register = (on, options) => {
  const every = Math.max(1, Number(options.every ?? 30))
  const unitMs = options.unit === 'hours' ? 3_600_000 : 60_000
  toastMs = Math.max(5, Number(options.closeAfterSeconds ?? 60)) * 1000
  showTranslation = options.translation !== false
  wordsPerLine = Math.min(40, Math.max(3, Math.round(Number(options.wordsPerLine ?? 9)) || 9))

  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await $.command.register({ name: 'quran', description: 'Open the Quran widget on the current verse' }).catch(() => {})
    // Pick up where the last session stopped.
    await restore($)
    await syncSwitch($)
    // One timer each, even if session.start fires again.
    poll?.cancel()
    poll = $.clock.every(SWITCH_POLL_MS, () => void syncSwitch($))
    tick?.cancel()
    cancelCloser()
    tick = $.clock.every(every * unitMs, () => void popupNext($).catch(() => {}))
    return r
  })

  on('command.run', { command: 'quran' }, async $ => ({ text: await openWidget($) }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    await load($)
    const i = await read($, index)
    const verse = verses[wrap(i)]
    const en = english(i)

    if (verse === undefined) {
      return <Text dimColor>No verse loaded.</Text>
    }

    return (
      <Box flexDirection="column" alignItems="center" gap={1}>
        <Box alignSelf="flex-end">
          <Text dir="rtl" size="heading" weight="semibold" dimColor>
            {header(verse)}
          </Text>
        </Box>
        <Box flexDirection="column" alignItems="center" gap="md">
          {lines(verse.text).map((line, lineNo) => (
            <Box key={`l${lineNo}`}>
              <Text dir="rtl" size="title">{line}</Text>
            </Box>
          ))}
        </Box>
        {en ? (
          <Box key="en">
            <Text dir="ltr" size="body" dimColor>{en}</Text>
          </Box>
        ) : null}
        <Box flexDirection="row" justifyContent="center" gap={1}>
          <Button key="prev" label="Previous" onPress={() => stepPane($, -1)} />
          <Button key="next" label="Next" variant="primary" onPress={() => stepPane($, 1)} />
          <Button key="close" label="Close" role="dismiss" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
