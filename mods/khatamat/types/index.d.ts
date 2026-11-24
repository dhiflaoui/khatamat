export type QuranVerse = {
  chapter: number
  verse: number
  text: string
  chapter_ar: string
  chapter_en_letters: string
}

declare module 'claude-code' {
  interface PluginState {
    'khatamat': {
      /** Position in the verse list of the verse shown now; -1 before the first verse. */
      index: number
    }
  }
}
