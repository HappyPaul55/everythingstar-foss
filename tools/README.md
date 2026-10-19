# Conversion tools

`convert-ultrastar/` is a **development-only** tool. It parses UltraStar
`song.txt` files with the EverythingStar game's own readers, writes the
Guitar Hero vocal MIDI and the EverythingStar song/chart documents, and calls
`stems.py` (Demucs `htdemucs_6s` in WSL) for the six stems.

It expects the EverythingStar game repository as a sibling checkout:

```
Works/
  client-everythingstar-happypaul55-com/
  client-everythingstar-foss-happypaul55-com/
```

The website does not use this tool at runtime and does not depend on the game
checkout. It is excluded from the site's TypeScript check.

```bash
bun tools/convert-ultrastar/index.ts \
  --song "../client-typestar-happypaul55-com/songs/Creative Commons/<Artist> - <Title>" \
  --out public/songs
```

Demucs runs in WSL; `--python` and `--stems-script` can change the interpreter
and splitter path.
