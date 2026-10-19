import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LIBRARY = join(process.cwd(), "public", "songs");

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
  { file: "notes.mid", label: "Guitar Hero vocal MIDI" },
  { file: "song.ini", label: "Guitar Hero metadata" },
  { file: "song.json", label: "EverythingStar song document" },
  { file: "vocals.json", label: "EverythingStar vocal chart" },
  { file: "stems.json", label: "Stem manifest" },
  { file: "preview.ogg", label: "30-second preview" },
  { file: "license.txt", label: "Source licence" },
];

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURI(part))
    .join("/");
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
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

function stemFiles(folder: string): StemFile[] {
  return STEMS.map((stem) => ({
    ...stem,
    size: formatBytes(fileSize(folder, stem.file)),
    url: `/songs/${encodePath(folder)}/${stem.file}`,
  }));
}

export const songs: LibrarySong[] = playlist.songs.map((entry) => {
  const folder = entry.song.split("/")[0] ?? entry.id;
  const license = licensesByFolder.get(folder);
  return {
    id: entry.id,
    folder,
    title: entry.title,
    artist: entry.artist.name,
    durationMs: entry.durationMs,
    duration: formatDuration(entry.durationMs),
    cover: entry.art ? `/songs/${encodePath(entry.art)}` : null,
    preview: `/songs/${encodePath(folder)}/preview.ogg`,
    license: license?.audioLicense ?? "see license.txt",
    chartLicense: license?.chartLicense ?? "not stated",
    notes: license?.notes ?? "",
    licenseFile: license ? `/songs/${encodePath(license.licenseFile)}` : null,
    stems: stemFiles(folder),
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
  return {
    songs: songs.length,
    stemsPerSong: STEMS.length,
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
      url: `/songs/${encodePath(song.folder)}/${doc.file}`,
    })),
  ];
}
