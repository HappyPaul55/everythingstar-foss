# EverythingStar FOSS

A standalone, **non-commercial** library of UltraStar songs converted for
EverythingStar and Guitar Hero-compatible players — plus the static site that
lists it. It is deliberately separate from the EverythingStar game so the game
can stay commercial while this library stays public and free.

- **37 songs** in `public/songs/`, one folder each.
- **Two songs are not included** because their licences forbid derivatives; see
  `NOT-INCLUDED.md`.
- Every song keeps its original `license.txt`; see `ATTRIBUTION.md` and
  `public/songs/licenses.json` for the full audit.
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
- `/licenses` — the licence audit and the two exclusions;
- `/songs/playlist.json` — the EverythingStar playlist;
- `/ATTRIBUTION.md`, `/NOT-INCLUDED.md`, `/songs/licenses.json` — the raw
  attribution files.

The site reads `public/songs/playlist.json` and
`public/songs/licenses.json` at build time, so it cannot drift from the
library. It is intended for `https://everythingstar-foss.happypaul55.com`.
`public/_headers` sends `Access-Control-Allow-Origin: *` so a game on another
origin can fetch the playlist, charts and audio.

## Using the library

Add this URL in EverythingStar’s **Playlists** dialog, or in any player that
understands the same playlist / song / chart documents:

```
https://everythingstar-foss.happypaul55.com/songs/playlist.json
```

Clone Hero and YARG can copy any song folder into their Songs directory and
scan it. The same folder works in all three.

## What is in a song folder

```
<Artist> - <Title>/
  notes.mid          PART VOCALS only - lyrics, pitch, line markers
  song.ini           Guitar Hero / Clone Hero / YARG metadata
  song.json          EverythingStar song document
  vocals.json        EverythingStar vocal chart
  vocals.ogg         vocals stem
  guitar.ogg         guitar stem
  bass.ogg           bass stem
  drums.ogg          drums stem
  keys.ogg           piano stem
  song.ogg           "other" / backing stem
  preview.ogg        30 s preview
  album.png|jpg      cover
  license.txt        the source licence
  stems.json         stem roles, gain and measured levels
```

The six stems are a Demucs `htdemucs_6s` separation and sum back to the source
mix. `song.ogg` is the residual/backing stem, by Guitar Hero convention.

In EverythingStar the vocal stem is held out while somebody is singing; a
typing-only band and Listen keep the guide vocal. Clone Hero / YARG use their
own vocal-volume setting.

No guitar, bass or drum charts were generated. The only chart is the UltraStar
vocal line converted 1:1; the instrument stems are ready for a chart later.

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
