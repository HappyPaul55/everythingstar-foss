# EverythingStar FOSS

A standalone, **non-commercial** library of UltraStar songs converted for
EverythingStar and Guitar Hero-compatible players — plus the static site that
lists it. It is deliberately separate from the EverythingStar game so the game
can stay commercial while this library stays public and free.

- **37 songs** in `songs/`, one folder each.
- Only works whose licences permit derivative use are included.
- Every song keeps its original `license.txt`; see `ATTRIBUTION.md` and
  `songs/licenses.json` for the full audit.
- Audio is **OGG-only** (stems + preview). No MP3 or WAV copies are shipped.

## The site

Astro, static output, no server and no dynamic workers:
`wrangler.jsonc` uploads `dist/` as Cloudflare static assets.

```bash
bun install
bun run dev      # http://localhost:4321
bun run build    # dist/
bun run preview
bun run check
```

Pages:

- `/` — what the library is, numbers, featured songs, how to use it;
- `/songs` — the full list with search and 30-second previews;
- `/songs/<id>` — one song’s stems, chart/document files and licence;
- `/ATTRIBUTION.md` — the attribution page.

The playlist and every song asset are served from GitHub:
`https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/<ref>/songs/`,
where `<ref>` is `main` in production and the build commit for a branch or
pull-request preview. Licence details live on each song page; there is no
separate licences page. The game itself is at
<https://everythingstar.happypaul55.com>.

The site reads `songs/playlist.json` and `songs/licenses.json` at build time,
so it cannot drift from the library. The library is not copied into `dist/`,
so a deploy uploads only the site shell. It is intended for
`https://everythingstar-foss.happypaul55.com`. Raw GitHub sends CORS headers,
so a game on another origin can fetch the playlist, charts and audio.

## Using the library

Add this URL in EverythingStar’s **Playlists** dialog, or in any player that
understands the same playlist / song / chart documents:

```
https://raw.githubusercontent.com/HappyPaul55/everythingstar-foss/main/songs/playlist.json
```

Clone Hero and YARG can copy any song folder into their Songs directory and
scan it. The same folder works in all three.

## What is in a song folder

```
<Artist> - <Title>/
  notes.mid          Guitar Hero MIDI chart (vocals; full band for Code Monkey)
  song.ini           Guitar Hero / Clone Hero / YARG metadata
  song.json          EverythingStar song document
  vocals.json        EverythingStar vocal chart
  guitar-*.json      EverythingStar guitar charts (Code Monkey)
  bass-*.json        EverythingStar bass charts (Code Monkey)
  drums-*.json       EverythingStar drum charts (Code Monkey)
  vocals.ogg         vocals stem
  guitar.ogg         guitar stem
  bass.ogg           bass stem
  drums.ogg          drums stem (six-stem songs)
  drums_1.ogg        source drum stem 1 (Code Monkey)
  drums_2.ogg        source drum stem 2 (Code Monkey)
  drums_3.ogg        source drum stem 3 (Code Monkey)
  keys.ogg           piano stem
  song.ogg           "other" / backing stem
  preview.ogg        30 s preview
  album.png|jpg      cover
  license.txt        the source licence
  stems.json         stem roles, gain and measured levels
```

Most songs use six Demucs `htdemucs_6s` stems that sum back to the source mix.
`song.ogg` is the residual/backing stem, by Guitar Hero convention. Code Monkey
instead carries NoisyPuppet's source multitrack — vocals, guitar, bass, three
drum stems and backing — converted 1:1 from Opus to OGG.

In EverythingStar the vocal stem is held out while somebody is singing; a
typing-only band and Listen keep the guide vocal. Clone Hero / YARG use their
own vocal-volume setting.

Most songs carry only the UltraStar vocal chart. Code Monkey also carries
NoisyPuppet's source full-band guitar, bass, drum and vocal charts. No notes
were invented from audio.

## Conversion tool

`tools/convert-ultrastar/` is a **development-only** tool. It imports the
EverythingStar game’s parsers from a sibling checkout, so the conversion uses
the exact readers the game uses. The site does not depend on that checkout and
the tool is excluded from `astro check`. See `tools/README.md`.

## Licence

The project’s own code, site and metadata are MIT (see `LICENSE`). The songs,
lyrics, artwork and charts are **not** MIT; they remain under the licences in
each folder’s `license.txt`, and the library is non-commercial. See
`ATTRIBUTION.md`. Do not sell or paywall the songs, and keep the source licence
with any copy.
