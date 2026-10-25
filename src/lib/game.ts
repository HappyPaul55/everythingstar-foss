/**
 * Links into EverythingStar.
 *
 * The game's `/open` page reads one query parameter and asks before it changes
 * anything: `playlist` adds a whole library, `song` adds one song document. Building
 * them with `URLSearchParams` is the contract — the target URL keeps its own query
 * string and encoding, and nothing is pasted into an `=` by hand.
 *
 * See the game's `DEEPLINKS.md`.
 */

export const GAME_OPEN = "https://everythingstar.happypaul55.com/open";

export function addPlaylistLink(playlistUrl: string): string {
  const link = new URL(GAME_OPEN);
  link.searchParams.set("playlist", playlistUrl);
  return link.href;
}

export function addSongLink(songDocumentUrl: string): string {
  const link = new URL(GAME_OPEN);
  link.searchParams.set("song", songDocumentUrl);
  return link.href;
}
