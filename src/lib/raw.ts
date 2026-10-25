/**
 * Where the song library lives.
 *
 * The repository is public and the files are served from GitHub's raw host, so
 * the static site never ships the 800 MB library. Song **assets** (covers, stems,
 * charts) resolve through `rawUrl` against the build's ref: a production build
 * points at `main`, a branch preview at the commit it was built from.
 *
 * The **playlist and the Add links** are different: they are things a player
 * copies or follows into the game, so they always point at `main`. A shared link
 * then follows songs added to the library rather than being pinned to the commit
 * that happened to build the page. (A player still presses Refresh in the game.)
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
/** The stable library URL every Add and playlist link uses. */
export const MAIN_BASE = `https://raw.githubusercontent.com/${REPO}/main/${SONGS}`;
export const PLAYLIST_URL = `${MAIN_BASE}/playlist.json`;

export function encodePath(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURI(part))
    .join("/");
}

/** A song asset at the build's ref, for this page's own file links. */
export function rawUrl(path: string): string {
  return `${RAW_BASE}/${encodePath(path)}`;
}

/** A song document at the stable main ref, for a link into the game. */
export function mainRawUrl(path: string): string {
  return `${MAIN_BASE}/${encodePath(path)}`;
}
