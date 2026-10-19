import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { rawUrl } from "./raw";

const LIBRARY = join(process.cwd(), "songs");

interface PlaylistEntry {
  id: string;
  song: string;
  title: string;
  artist: { id: string; name: string };
  art?: string;
  durationMs: number;
  previewStartMs: number;
  offer?: { voice?: { chartType: string; parts: number } };
}

interface SongStem {
  id: string;
  name?: string;
  url: string;
}

interface SongDocument {
  audio?: { stems?: SongStem[] };
  parts?: { charts?: { url?: string }[] }[];
}

interface LicenseEntry {
  folder: string;
  title: string;
  artist: string;
  audioLicense: string;
  chartLicense: string;
  coverLicense: string;
  backgroundLicense: string;
  derivatives: string;
  commercialUse: boolean | null;
  shareAlike: boolean;
  changes: string;
  licenseFile: string;
  notes: string;
}

interface Playlist {
  name: string;
  description?: string;
  songs: PlaylistEntry[];
}

interface Audit {
  songs: LicenseEntry[];
}

const playlist = JSON.parse(readFileSync(join(LIBRARY, "playlist.json"), "utf8")) as Playlist;
const audit = JSON.parse(readFileSync(join(LIBRARY, "licenses.json"), "utf8")) as Audit;

const licensesByFolder = new Map(audit.songs.map((entry) => [entry.folder, entry]));

export interface StemFile {
  file: string;
  label: string;
  size: string;
  url: string;
}

export interface LibrarySong {
  id: string;
  folder: string;
  title: string;
  artist: string;
  durationMs: number;
  duration: string;
  cover: string | null;
  preview: string;
  license: string;
  chartLicense: string;
  notes: string;
  licenseFile: string | null;
  stems: StemFile[];
  /** The source's chart author, when it names one. */
  charter: string | null;
  /** Whether the folder carries lane charts as well as the vocal chart. */
  fullBand: boolean;
  search: string;
}

export const STEMS: { file: string; label: string }[] = [
  { file: "vocals.ogg", label: "Vocals" },
  { file: "guitar.ogg", label: "Guitar" },
  { file: "bass.ogg", label: "Bass" },
  { file: "drums.ogg", label: "Drums" },
  { file: "keys.ogg", label: "Keys (piano)" },
  { file: "song.ogg", label: "Other / backing" },
];

export const DOCUMENTS: { file: string; label: string }[] = [
  { file: "notes.mid", label: "Guitar Hero MIDI chart" },
  { file: "song.ini", label: "Guitar Hero metadata" },
  { file: "song.json", label: "EverythingStar song document" },
  { file: "stems.json", label: "Stem manifest" },
  { file: "preview.ogg", label: "30-second preview" },
  { file: "license.txt", label: "Source licence" },
];

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileSize(folder: string, file: string): number {
  try {
    return statSync(join(LIBRARY, folder, file)).size;
  } catch {
    return 0;
  }
}

const songDocuments = new Map<string, SongDocument | null>();

function songDocument(folder: string): SongDocument | null {
  if (songDocuments.has(folder)) return songDocuments.get(folder) ?? null;
  try {
    const doc = JSON.parse(
      readFileSync(join(LIBRARY, folder, "song.json"), "utf8"),
    ) as SongDocument;
    songDocuments.set(folder, doc);
    return doc;
  } catch {
    songDocuments.set(folder, null);
    return null;
  }
}

function stemFile(folder: string, url: string, label: string): StemFile {
  const file = basename(url.replace(/\\/g, "/"));
  return {
    file,
    label,
    size: formatBytes(fileSize(folder, file)),
    url: rawUrl(`${folder}/${file}`),
  };
}

function stemFiles(folder: string): StemFile[] {
  const declared = songDocument(folder)?.audio?.stems;
  if (!declared || declared.length === 0) {
    return STEMS.map((stem) => stemFile(folder, stem.file, stem.label));
  }
  // The backing is the song's base, so it reads last rather than first.
  return [...declared]
    .sort((a, b) => Number(a.id === "stem_master") - Number(b.id === "stem_master"))
    .map((stem) => stemFile(folder, stem.url, stem.name ?? stem.id.replace(/^stem_/, "")));
}

/** Every chart document in a folder, in a stable reading order. */
function chartFiles(folder: string): string[] {
  try {
    return readdirSync(join(LIBRARY, folder))
      .filter(
        (name) =>
          name.toLowerCase().endsWith(".json") &&
          name !== "song.json" &&
          name !== "stems.json",
      )
      .sort((a, b) => {
        if (a === "vocals.json") return -1;
        if (b === "vocals.json") return 1;
        return a.localeCompare(b);
      });
  } catch {
    return [];
  }
}

function chartLabel(file: string): string {
  if (file === "vocals.json") return "EverythingStar vocal chart";
  const match = /^(guitar|bass|drums|keys)-(.+)\.json$/i.exec(file);
  if (!match) return file.replace(/\.json$/i, "");
  const instrument = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  return `${instrument} · ${match[2]}`;
}

function charter(folder: string): string | null {
  try {
    const text = readFileSync(join(LIBRARY, folder, "song.ini"), "utf8");
    return /^charter\s*=\s*(.+)$/im.exec(text)?.[1]?.trim() || null;
  } catch {
    return null;
  }
}

export const songs: LibrarySong[] = playlist.songs.map((entry) => {
  const folder = entry.song.split("/")[0] ?? entry.id;
  const license = licensesByFolder.get(folder);
  const charts = chartFiles(folder);
  return {
    id: entry.id,
    folder,
    title: entry.title,
    artist: entry.artist.name,
    durationMs: entry.durationMs,
    duration: formatDuration(entry.durationMs),
    cover: entry.art ? rawUrl(entry.art) : null,
    preview: rawUrl(`${folder}/preview.ogg`),
    license: license?.audioLicense ?? "see license.txt",
    chartLicense: license?.chartLicense ?? "not stated",
    notes: license?.notes ?? "",
    licenseFile: license ? rawUrl(license.licenseFile) : null,
    stems: stemFiles(folder),
    charter: charter(folder),
    fullBand: charts.some((file) => /^(guitar|bass|drums|keys)-/i.test(file)),
    search: `${entry.title} ${entry.artist.name} ${license?.audioLicense ?? ""}`.toLowerCase(),
  };
});

export const stats = (() => {
  let total = 0;
  let ogg = 0;
  for (const folder of readdirSync(LIBRARY, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    for (const file of readdirSync(join(LIBRARY, folder.name))) {
      const size = statSync(join(LIBRARY, folder.name, file)).size;
      total += size;
      if (file.endsWith(".ogg")) ogg += size;
    }
  }
  const stemCounts = songs.map((song) => song.stems.length);
  const minStems = Math.min(...stemCounts);
  const maxStems = Math.max(...stemCounts);
  return {
    songs: songs.length,
    stemsPerSong: maxStems,
    stemsLabel: minStems === maxStems ? `${minStems}` : `${minStems}–${maxStems}`,
    totalBytes: total,
    oggBytes: ogg,
    total: formatBytes(total),
    ogg: formatBytes(ogg),
  };
})();

export function songFiles(song: LibrarySong): StemFile[] {
  return [
    ...song.stems,
    ...DOCUMENTS.map((doc) => ({
      ...doc,
      size: formatBytes(fileSize(song.folder, doc.file)),
      url: rawUrl(`${song.folder}/${doc.file}`),
    })),
    ...chartFiles(song.folder).map((file) => ({
      file,
      label: chartLabel(file),
      size: formatBytes(fileSize(song.folder, file)),
      url: rawUrl(`${song.folder}/${file}`),
    })),
  ];
}
