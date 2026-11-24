# 📖 khatamat · ختمات

A verse of the Quran in Claude Code every few minutes, in order, from Al-Fatiha to An-Nas and around again.

*Khatamat* is the plural of *khatma*, one full reading of the Quran. Once the mod reaches the last verse, it starts the next khatma at 1:1.

## Install

```sh
claude plugin marketplace add alkacem/khatamat
```

```sh
claude plugin install khatamat@khatamat
```

Restart Claude Code after installing. You need a Claude Code version that supports function-hook mods (plugins).

To try it without installing:

```sh
git clone https://github.com/alkacem/khatamat && cd khatamat
claude --plugin-dir mods/khatamat
```

## What it does

- **A verse at a set interval.** Every N minutes or hours, the next verse opens in a small pane above the prompt and closes on its own after a set time.
- **`/quran`** opens the pane on the current verse, with **Previous**, **Next** and **Close** buttons. The pane resizes to fit each verse.
- **Arabic text.** The verse is split into balanced, centred lines with space between them, so long verses stay readable. The header shows the surah and verse number in Arabic, on the right: `سورة البقرة · الآية 255`.
- **English translation.** The Saheeh International translation appears under the Arabic, in dimmed text. You can turn it off.
- **It remembers where you are.** The position is saved across sessions, so you carry on from the last verse you saw. After 114:6 it starts again at 1:1.
- **Pane or toast.** The timed popup shows as a pane only when the chat area is wide enough; otherwise you get a toast (see [Notes](#notes)).
- **Local only.** All 6236 verses ship with the plugin, so nothing is fetched from the network.

## Settings

Set these in `/config` (khatamat):

| Setting | Default | What it does |
| --- | --- | --- |
| Show a verse every (`every`) | 30 | How many minutes or hours between two popups |
| Unit (`unit`) | `minutes` | `minutes` or `hours` |
| Popup stays for (`closeAfterSeconds`) | 60 | Seconds before a popup closes on its own (minimum 5) |
| Words per line (`wordsPerLine`) | 9 | The most Arabic words on one line. Long verses are split into even lines |
| English translation (`translation`) | on | Show the English under the Arabic in the pane |

## Sources

The Quranic data comes from **[Tarteel QUL](https://qul.tarteel.ai)** (Quranic Universal Library).

- **Arabic text:** [Imlaei Script – Ayah by ayah](https://qul.tarteel.ai/resources/quran-script/83) (QUL resource 83).
  - It uses standard (imlaei) spelling with full harakat.
  - The waqf (pause) marks are removed when a verse is shown, because the fonts Claude Code uses don't include them. The harakat and the dagger alef are kept.
- **English translation:** [Saheeh International](https://qul.tarteel.ai/resources/translation/193) (QUL resource 193).
  - Footnote markers and notes were removed.
  - The translation is the work of Saheeh International and published by Dar Abul-Qasim. All credit for it belongs to them.

The files in `mods/khatamat/data/` were converted once from the QUL downloads:

- `quran-imlaei.json`: the Arabic, an array of `{chapter, verse, text, chapter_ar, chapter_en_letters}`.
- `quran-en.json`: the English, one string per verse in the same order.

## Notes

- **Pane or toast:** Claude Code only draws a pane that a plugin opens on its own when the chat area is wide enough: at least 144 columns, or 110 once you've opened `/quran` by hand.
  - In a narrower window the timed popup isn't drawn. When that happens, the code (`popupNext` in `mods/khatamat/hooks/register.tsx`) closes the pane and shows the verse as a toast instead.
  - `/quran` always opens the pane, because you asked for it.
  - To get the pane for timed popups, widen the window or the chat area.
- **Font:** Claude Code chooses the font for Arabic text; a mod can't. If a character shows as a box, your system's font is missing that glyph.
- **Mod files:** the mod lives in `mods/khatamat/`:
  - `hooks/register.tsx`: the logic;
  - `.claude-plugin/plugin.json`: the manifest and settings;
  - `data/`: the verses.
- **Typechecking (contributors):** `mods/khatamat/tsconfig.json` expects the Claude Code engine types in `mods/khatamat/types/engine/`. Copy them there from any function-hook mod that ships them; the folder is in `.gitignore`.

## Licence

- **Code:** [Apache-2.0](LICENSE).
- **Quran text and English translation:** not covered by this licence. They belong to their sources above and are included for non-commercial use with attribution. Tarteel QUL lists no licence for either resource. If you are a rights holder and want a change, please open an issue.

## Author

[alKacem](https://github.com/dhiflaoui)
