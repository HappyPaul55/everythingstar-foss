/**
 * Where the song library lives.
 *
 * The repository is public and the files are served from GitHub's raw host, so
 * the static site never ships the 800 MB library. Everything the site links to
 * (covers, stems, charts and the playlist) resolves through `rawUrl`.
 *
 * A production build points at `main`. A branch or pull-request preview points
 * at the commit it was built from, so new or changed song files are served from
 * that branch instead of falling back to `main` (where they may not exist yet).
 */
const REPO = "HappyPaul55/everythingstar-foss";
const SONGS = "songs";

const env = process.env;
const branch =
  env.WORKERS_CI_BRANCH ??
  env.CF_PAGES_BRANCH ??
  env.GITHUB_HEAD_REF ??
  env.GITHUB_REF_NAME ??
  "main";
const commit = env.WORKERS_CI_COMMIT_SHA ?? env.CF_PAGES_COMMIT_SHA ?? env.GITHUB_SHA;
const ref = branch === "main" || branch === "master" ? "main" : (commit ?? branch);

export const RAW_REF = ref;
export const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${ref}/${SONGS}`;
export const PLAYLIST_URL = `${RAW_BASE}/playlist.json`;

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURI(part))
    .join("/");
}

export function rawUrl(path: string): string {
  return `${RAW_BASE}/${encodePath(path)}`;
}
