/**
 * Convert an UltraStar song folder into a per-song Guitar Hero / Clone Hero /
 * YARG folder and an EverythingStar song document — with separated stems.
 *
 * ```bash
 * bun tools/convert-ultrastar/index.ts \
 *   --song "C:/…/Jonathan Coulton - Code Monkey" \
 *   --out public/songs
 * ```
 *
 * **Development tool only.** It imports the parsers from a sibling checkout of
 * the EverythingStar game (`../client-everythingstar-happypaul55-com`) so the
 * conversion uses the exact readers the game uses. The site itself does not
 * depend on that checkout.
 *
 * What it does:
 *  - parses `song.txt` with the game's own UltraStar reader (the same parser the
 *    runtime uses), so the vocal chart is a conversion and not a new chart;
 *  - writes `notes.mid` with **PART VOCALS only** — line markers, lyrics, pitches;
 *  - writes `song.ini`, `song.json` and `vocals.json` in the same folder;
 *  - calls `stems.py` in WSL to split the master into `vocals`, `guitar`, `bass`,
 *    `drums`, `keys` and `song.ogg` (the "other"/backing stem), plus preview/art;
 *  - validates the MIDI by reading it back with the game's `readGameMidi`.
 *
 * It writes no lane charts. Guitar/bass/drums are stems waiting for a future
 * chart, never notes invented from audio.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeText } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/bytes";
import {
  ART_NAMES,
  AUDIO_NAMES,
  findName,
  findSheet,
} from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/files";
import { readGameMidi } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/ghmidi";
import { readIni } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/ini";
import { readUltraStar } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/ultrastar";
import { writeSource, type WriteLayout } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/write";
import { readChart, readSongDoc, sourceChartFor } from "../../../client-everythingstar-happypaul55-com/src/lib/game/source";
import type { MelodyChart } from "../../../client-everythingstar-happypaul55-com/src/lib/game/track";
import type { ParsedSource } from "../../../client-everythingstar-happypaul55-com/src/lib/game/sources/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

interface Options {
  song: string;
  out: string;
  stemsScript: string;
  python: string;
  previewMs: number | null;
  skipStems: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    song: "",
    out: join(ROOT, "public/songs"),
    stemsScript: join(HERE, "stems.py"),
    python: "/home/happy/StemForge/.venv/bin/python",
    previewMs: null,
    skipStems: false,
  };
  for (let at = 0; at < argv.length; at += 1) {
    const flag = argv[at];
    const value = argv[at + 1];
    switch (flag) {
      case "--song": options.song = value ?? ""; at += 1; break;
      case "--out": options.out = resolve(value ?? options.out); at += 1; break;
      case "--stems-script": options.stemsScript = resolve(value ?? options.stemsScript); at += 1; break;
      case "--python": options.python = value ?? options.python; at += 1; break;
      case "--preview-ms": options.previewMs = Number(value); at += 1; break;
      case "--skip-stems": options.skipStems = true; break;
      default: break;
    }
  }
  if (!options.song) {
    console.error("usage: bun scripts/convert-ultrastar/index.ts --song <folder> [--out <dir>] [--preview-ms n] [--skip-stems]");
    process.exit(1);
  }
  return options;
}

function fileIn(dir: string, candidates: readonly string[]): string | null {
  const name = findName(readdirSync(dir), candidates);
  return name ? join(dir, name) : null;
}

function header(text: string, key: string): string | null {
  const match = new RegExp(`^#${key}:(.*)$`, "im").exec(text);
  return match ? match[1].trim() : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "song";
}

function safeFolder(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "") || "song";
}

/**
 * Covers whose licence forbids derivatives. They are copied **byte for byte**
 * instead of being resized, so the library distributes the original artwork
 * rather than making an adaptation. Everything else is resized to a square.
 */
const NO_DERIVATIVE_COVERS = new Set([
  "Better",
  "I Feel Fantastic",
  "Monkey Shines",
  "My Beige Bear",
  "That Spells DNA",
]);

function wslPath(win: string): string {
  const abs = resolve(win);
  return `/mnt/${abs[0].toLowerCase()}${abs.slice(2).replace(/\\/g, "/")}`;
}

function probeDurationMs(path: string): number {
  const result = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
    { encoding: "utf8" },
  );
  const seconds = Number((result.stdout ?? "").trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

/** A number from an UltraStar header: a comma may be the decimal separator. */
function ultraBpm(text: string): number {
  const raw = header(text, "BPM");
  const value = raw === null ? 120 : Number(raw.replace(",", ".").split(/\s+/)[0]);
  if (!Number.isFinite(value) || value <= 0) return 120;
  // UltraStar's #BPM is double the song's tempo, and its beat is a quarter of that.
  let bpm = value / 2;
  while (bpm > 220) bpm /= 2;
  while (bpm < 60) bpm *= 2;
  return bpm;
}

// ---------------------------------------------------------------------------
// MIDI: PART VOCALS + lyrics, and nothing else
// ---------------------------------------------------------------------------

const PPQ = 480;

interface MidiEvent {
  tick: number;
  order: number;
  bytes: number[];
}

function varLen(value: number): number[] {
  let rest = Math.max(0, Math.round(value));
  const out = [rest & 0x7f];
  rest = Math.floor(rest / 128);
  while (rest > 0) {
    out.unshift((rest & 0x7f) | 0x80);
    rest = Math.floor(rest / 128);
  }
  return out;
}

function meta(type: number, data: number[]): number[] {
  return [0xff, type, ...varLen(data.length), ...data];
}

function textMeta(type: number, text: string): number[] {
  return meta(type, [...new TextEncoder().encode(text)]);
}

function chunk(id: string, data: number[]): number[] {
  const length = data.length;
  return [
    ...id.split("").map((ch) => ch.charCodeAt(0)),
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...data,
  ];
}

function track(events: MidiEvent[]): number[] {
  const data: number[] = [];
  let last = 0;
  for (const event of [...events].sort((a, b) => a.tick - b.tick || a.order - b.order)) {
    data.push(...varLen(event.tick - last), ...event.bytes);
    last = event.tick;
  }
  data.push(0x00, 0xff, 0x2f, 0x00);
  return chunk("MTrk", data);
}

function buildMidi(
  melody: MelodyChart,
  bpm: number,
  durationMs: number,
): Uint8Array {
  const toTick = (ms: number) => Math.max(0, Math.round((ms / 1000) * (bpm / 60) * PPQ));
  const notes = melody.notes
    .filter((note) => note.part === 0)
    .sort((a, b) => a.timeMs - b.timeMs);
  const lines = [...melody.lines].sort((a, b) => a.timeMs - b.timeMs);

  const voice: MidiEvent[] = [
    { tick: 0, order: 0, bytes: textMeta(0x03, "PART VOCALS") },
  ];
  const noteEvents: MidiEvent[] = [];

  let at = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = toTick(line.timeMs);
    const nextMs = lineIndex + 1 < lines.length ? lines[lineIndex + 1].timeMs : Number.POSITIVE_INFINITY;

    // A phrase marker opens the line; the reader assigns it to the first
    // syllable at or after the marker.
    voice.push({ tick: lineStart, order: 3, bytes: [0x90, 105, 100] });
    voice.push({ tick: lineStart + 1, order: 0, bytes: [0x80, 105, 0] });

    const lineNotes = [];
    while (at < notes.length && notes[at].timeMs < line.timeMs - 1) at += 1;
    while (at < notes.length && notes[at].timeMs < nextMs) {
      lineNotes.push(notes[at]);
      at += 1;
    }
    lineNotes.sort((a, b) => a.timeMs - b.timeMs);

    const words = [...line.words].sort((a, b) => a.timeMs - b.timeMs);
    const seenWord = new Set<number>();
    let wordIndex = 0;

    for (let index = 0; index < lineNotes.length; index += 1) {
      const note = lineNotes[index];
      while (
        wordIndex + 1 < words.length &&
        words[wordIndex + 1].timeMs <= note.timeMs + 1
      ) {
        wordIndex += 1;
      }
      // One whole word on the first syllable, then `+` for the notes that carry
      // it. This keeps words containing a real hyphen ("Re- Your Brains") from
      // being mistaken for the Guitar Hero continuation marker.
      const first = !seenWord.has(wordIndex);
      seenWord.add(wordIndex);
      const text = first && words[wordIndex] ? words[wordIndex].text : "+";

      const pitch =
        note.row === null ? 36 : Math.max(0, Math.min(99, melody.rootMidi + note.row));
      const start = toTick(note.timeMs);
      const next = index + 1 < lineNotes.length
        ? toTick(lineNotes[index + 1].timeMs)
        : Number.POSITIVE_INFINITY;
      const end = Math.max(start + 1, Math.min(toTick(note.timeMs + note.lengthMs), next));

      noteEvents.push({ tick: start, order: 1, bytes: textMeta(0x05, text || "+") });
      noteEvents.push({ tick: start, order: 2, bytes: [0x90, pitch, 100] });
      noteEvents.push({ tick: end, order: 0, bytes: [0x80, pitch, 0] });
    }
  }
  voice.push(...noteEvents);

  const tempo = Math.round(60_000_000 / bpm);
  const conductor: MidiEvent[] = [
    { tick: 0, order: 0, bytes: textMeta(0x03, "CONDUCTOR") },
    { tick: 0, order: 0, bytes: meta(0x51, [(tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff]) },
    { tick: 0, order: 0, bytes: meta(0x58, [4, 2, 24, 8]) },
  ];
  const events: MidiEvent[] = [
    { tick: 0, order: 0, bytes: textMeta(0x03, "EVENTS") },
    { tick: toTick(durationMs), order: 0, bytes: textMeta(0x01, "[end]") },
  ];

  const tracks = [track(conductor), track(voice), track(events)];
  const header = [
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06,
    0x00, 0x01,
    0x00, Math.min(255, tracks.length),
    0x01, 0xe0,
  ];
  return new Uint8Array([...header, ...tracks.flat()]);
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function convert(options: Options): void {
  const songDir = resolve(options.song);
  if (!existsSync(songDir)) throw new Error(`song folder not found: ${songDir}`);
  const entries = readdirSync(songDir);
  const sheet = findSheet(entries);
  if (!sheet) throw new Error(`no UltraStar chart in ${songDir}`);
  const text = decodeText(new Uint8Array(readFileSync(join(songDir, sheet))));

  const masterNames = AUDIO_NAMES.find(([role]) => role === "master")![1];
  const audioPath = fileIn(songDir, masterNames) ?? join(songDir, header(text, "MP3") ?? "");
  if (!existsSync(audioPath)) throw new Error(`no audio found in ${songDir}`);

  const cover = fileIn(songDir, ART_NAMES) ?? (header(text, "COVER") ? join(songDir, header(text, "COVER")!) : null);
  const license = ["license.txt", "LICENSE.txt"].map((name) => join(songDir, name)).find(existsSync) ?? null;

  const source: ParsedSource = readUltraStar({
    text,
    stems: { master: audioPath },
    art: cover,
    fallbackTitle: basename(songDir),
  });
  if (!source.melody) throw new Error(`no vocal melody in ${sheet}`);
  console.log(`parsed ${source.melody.notes.length} notes / ${source.melody.lines.length} lines`);

  const artist = source.meta.artist || basename(songDir).split(" - ")[0] || "";
  const title = source.meta.title || basename(songDir);
  // A non-Coulton folder's cover licence is often unstated, and a Coulton cover
  // may be NC-ND. In both cases, copy it untouched rather than adapt it.
  const copyCover = artist !== "Jonathan Coulton" || NO_DERIVATIVE_COVERS.has(title);
  const folder = safeFolder(`${artist} - ${title}`);
  const id = slug(`${artist}-${title}`);
  const outDir = join(options.out, folder);
  mkdirSync(outDir, { recursive: true });

  const probedMs = probeDurationMs(audioPath);
  const durationMs = probedMs || source.meta.durationMs;
  const previewMs =
    options.previewMs ??
    Math.max(20_000, Math.min(Math.round(durationMs * 0.3), Math.max(20_000, durationMs - 30_000)));

  if (!options.skipStems) {
    const args = [
      "wsl", "-d", "Ubuntu", "-u", "happy", "--", options.python,
      wslPath(options.stemsScript),
      "--audio", wslPath(audioPath),
      "--out", wslPath(outDir),
      "--preview-ms", String(previewMs),
    ];
    if (cover) args.push("--cover", wslPath(cover));
    if (copyCover) args.push("--copy-cover");
    if (license) args.push("--license", wslPath(license));
    console.log("splitting stems (Demucs htdemucs_6s)…");
    const result = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`stem splitter failed (${result.status})`);
  }

  const stemsDoc = JSON.parse(readFileSync(join(outDir, "stems.json"), "utf8")) as {
    durationMs: number;
    previewStartMs: number;
    sumVsSourceCorrelation: number;
    album: string | null;
  };

  source.meta = {
    ...source.meta,
    id,
    title,
    artist,
    durationMs: stemsDoc.durationMs,
    previewStartMs: stemsDoc.previewStartMs,
    art: stemsDoc.album,
    video: null,
  };
  source.lanes = [];
  source.audio = {
    source: "stems",
    stems: [
      { id: "stem_master", name: "Backing (other)", url: "song.ogg", instrument: null, defaultGainDb: 0, offsetMs: 0 },
      { id: "stem_vocals", name: "Vocals", url: "vocals.ogg", instrument: "vocals", defaultGainDb: 0, offsetMs: 0 },
      { id: "stem_lead_guitar", name: "Lead Guitar", url: "guitar.ogg", instrument: "lead_guitar", defaultGainDb: 0, offsetMs: 0 },
      { id: "stem_bass", name: "Bass", url: "bass.ogg", instrument: "bass", defaultGainDb: 0, offsetMs: 0 },
      { id: "stem_drums", name: "Drums", url: "drums.ogg", instrument: "drums", defaultGainDb: 0, offsetMs: 0 },
      { id: "stem_keys", name: "Keys", url: "keys.ogg", instrument: "keys", defaultGainDb: 0, offsetMs: 0 },
    ],
    // The app's default rule leaves the master out of `full` once there are three
    // parts. Here the master *is* the "other" stem, so include it explicitly.
    mixPresets: [
      {
        id: "full",
        stemIds: ["stem_master", "stem_vocals", "stem_lead_guitar", "stem_bass", "stem_drums", "stem_keys"],
      },
      { id: "stems", stemIds: ["stem_vocals", "stem_lead_guitar", "stem_bass", "stem_drums", "stem_keys"] },
    ],
    preview: "preview.ogg",
  };

  const layout: WriteLayout = {
    song: () => `${folder}/song.json`,
    chart: (_id, instrument, difficulty) => `${folder}/${instrument}-${difficulty}.json`,
    voice: (_id, hasPitch) => `${folder}/${hasPitch ? "vocals" : "lyrics"}.json`,
    chartUrl: (_id, instrument, difficulty) => `${instrument}-${difficulty}.json`,
    voiceUrl: (_id, hasPitch) => `${hasPitch ? "vocals" : "lyrics"}.json`,
  };
  const written = writeSource(source, layout);
  for (const file of written.files) {
    const target = join(options.out, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.body);
  }

  const bpm = ultraBpm(text);
  const midi = buildMidi(source.melody, bpm, stemsDoc.durationMs);
  writeFileSync(join(outDir, "notes.mid"), midi);

  const ini = [
    "[song]",
    `name = ${title.replace(/\r?\n/g, " ")}`,
    `artist = ${artist.replace(/\r?\n/g, " ")}`,
    `album = ${(source.meta.album ?? "").replace(/\r?\n/g, " ")}`,
    `genre = ${(header(text, "GENRE") ?? "").replace(/\r?\n/g, " ")}`,
    `year = ${header(text, "YEAR") ?? source.meta.year ?? ""}`,
    `charter = ${(header(text, "CREATOR") ?? "Ultrastar").replace(/\r?\n/g, " ")}`,
    "diff_vocals = 1",
    "diff_band = 1",
    "diff_guitar = -1",
    "diff_bass = -1",
    "diff_drums = -1",
    "diff_keys = -1",
    `song_length = ${stemsDoc.durationMs}`,
    `preview_start_time = ${stemsDoc.previewStartMs}`,
    "delay = 0",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "song.ini"), ini, "utf8");

  // Playlist (merge, so converting the next song does not erase this one).
  const playlistPath = join(options.out, "playlist.json");
  const entry = written.entry as Record<string, unknown>;
  entry.song = `${folder}/song.json`;
  if (stemsDoc.album) entry.art = `${folder}/${stemsDoc.album}`;
  else delete entry.art;
  let songs: unknown[] = [];
  if (existsSync(playlistPath)) {
    try {
      const old = JSON.parse(readFileSync(playlistPath, "utf8")) as { songs?: unknown[] };
      songs = Array.isArray(old.songs) ? old.songs : [];
    } catch {
      songs = [];
    }
  }
  songs = songs.filter((item) => (item as { id?: string })?.id !== id);
  songs.push(entry);
  writeFileSync(
    playlistPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        name: "Creative Commons",
        description: "Ultrastar songs converted with separated stems.",
        songs,
      },
      null,
      2,
    )}\n`,
  );

  validate(source, source.melody, {
    midiPath: join(outDir, "notes.mid"),
    iniPath: join(outDir, "song.ini"),
    songPath: join(options.out, folder, "song.json"),
    voicePath: join(options.out, folder, source.melody.hasPitch ? "vocals.json" : "lyrics.json"),
    songDocUrl: `https://convert.test/${encodeURIComponent(folder)}/song.json`,
    outDir,
    durationMs: stemsDoc.durationMs,
    correlation: stemsDoc.sumVsSourceCorrelation,
    bpm,
  });

  console.log(`\nconverted -> ${join(options.out, folder)}`);
  console.log(`  bpm ${bpm.toFixed(3)}  duration ${(stemsDoc.durationMs / 1000).toFixed(2)}s  stems corr ${stemsDoc.sumVsSourceCorrelation}`);
  console.log(`  playlist -> ${playlistPath}`);
}

interface Check {
  midiPath: string;
  iniPath: string;
  songPath: string;
  voicePath: string;
  songDocUrl: string;
  outDir: string;
  durationMs: number;
  correlation: number;
  bpm: number;
}

function validate(source: ParsedSource, melody: MelodyChart, check: Check): void {
  const problems: string[] = [];

  const read = readGameMidi({
    bytes: new Uint8Array(readFileSync(check.midiPath)),
    ini: readIni(readFileSync(check.iniPath, "utf8")),
    stems: {},
    art: null,
    fallbackTitle: source.meta.title,
  });
  if (!read.melody) {
    problems.push("notes.mid did not read back as a melody");
  } else {
    const want = melody.notes.filter((note) => note.part === 0);
    const got = read.melody.notes;
    if (want.length !== got.length) problems.push(`note count ${got.length} != ${want.length}`);
    if (melody.lines.length !== read.melody.lines.length) {
      problems.push(`line count ${read.melody.lines.length} != ${melody.lines.length}`);
    }
    const count = Math.min(want.length, got.length);
    let timeErrors = 0;
    let pitchErrors = 0;
    for (let index = 0; index < count; index += 1) {
      if (Math.abs(want[index].timeMs - got[index].timeMs) > 2) timeErrors += 1;
      const wantRow = want[index].row;
      const gotRow = got[index].row;
      const wantPitch = wantRow === null ? null : melody.rootMidi + wantRow;
      const gotPitch = gotRow === null ? null : read.melody.rootMidi + gotRow;
      if (wantPitch !== gotPitch) pitchErrors += 1;
    }
    if (timeErrors) problems.push(`${timeErrors} notes off by >2ms`);
    if (pitchErrors) problems.push(`${pitchErrors} pitches differ`);

    const wantWords = melody.lines.flatMap((line) => line.words.map((word) => word.text));
    const gotWords = read.melody.lines.flatMap((line) => line.words.map((word) => word.text));
    if (wantWords.join("\u0000") !== gotWords.join("\u0000")) {
      problems.push(`words differ (${gotWords.length} != ${wantWords.length})`);
    }
  }

  const songDoc = JSON.parse(readFileSync(check.songPath, "utf8")) as unknown;
  const readDoc = readSongDoc(songDoc, check.songDocUrl);
  if (readDoc.problems.length) problems.push(...readDoc.problems.map((p) => `song: ${p}`));
  if (!readDoc.doc) {
    problems.push("song.json did not read back");
  } else {
    const voiceChart = sourceChartFor(readDoc.doc, "words", "normal");
    if (!voiceChart) {
      problems.push("song.json has no voice part");
    } else {
      const voice = readChart(JSON.parse(readFileSync(check.voicePath, "utf8")), voiceChart, "words");
      if (voice.problems.length) problems.push(...voice.problems.map((p) => `voice: ${p}`));
      if (!voice.melody) problems.push("vocals.json did not read back as a melody");
    }
  }

  for (const file of ["song.ogg", "vocals.ogg", "guitar.ogg", "bass.ogg", "drums.ogg", "keys.ogg", "preview.ogg"]) {
    const path = join(check.outDir, file);
    if (!existsSync(path)) {
      problems.push(`missing ${file}`);
      continue;
    }
    const ms = probeDurationMs(path);
    if (file !== "preview.ogg" && Math.abs(ms - check.durationMs) > 60) {
      problems.push(`${file} is ${ms}ms, expected ${check.durationMs}ms`);
    }
  }
  if (check.correlation < 0.9) {
    problems.push(`stem sum correlation is only ${check.correlation}`);
  }

  if (problems.length === 0) {
    console.log("validation: OK (MIDI round-trip, song doc, audio lengths, stem sum)");
  } else {
    console.log("validation problems:");
    for (const problem of problems) console.log(`  - ${problem}`);
  }
}

const options = parseArgs(process.argv.slice(2));
convert(options);
