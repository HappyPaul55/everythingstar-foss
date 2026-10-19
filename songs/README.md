# Songs

37 converted songs, one folder each. `playlist.json` is the index;
`licenses.json` is the machine-readable licence audit.

Each folder is a Guitar Hero / Clone Hero / YARG folder **and** an EverythingStar
song folder. Most songs carry six Demucs stems:

- `vocals.ogg` - vocals
- `guitar.ogg` - guitar
- `bass.ogg` - bass
- `drums.ogg` - drums
- `keys.ogg` - piano
- `song.ogg` - the "other" / backing stem

The six stems sum to the source mix. `stems.json` records the model, gain and
measured levels. Code Monkey is the exception: it carries NoisyPuppet's source
multitrack with `drums_1.ogg`, `drums_2.ogg` and `drums_3.ogg` instead of one
`drums.ogg`.

Most songs carry only the UltraStar vocal chart. Code Monkey also carries
NoisyPuppet's full-band guitar, bass, drum and vocal charts. No lane charts were
invented from audio.

This library is non-commercial. See `../ATTRIBUTION.md` and each song's
`license.txt`.
