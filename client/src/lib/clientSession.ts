const LS_CLIENT_ID = 'pixelpoker_clientId';
const LS_PLAYER_NAME = 'pixelpoker_playerName';

/** Returns the stored clientId, generating and persisting one if absent. */
export function getOrCreateClientId(): string {
  let id = localStorage.getItem(LS_CLIENT_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(LS_CLIENT_ID, id);
  }
  return id;
}

/** Reads the player name from localStorage. Returns null if none has been saved. */
export function getSavedPlayerName(): string | null {
  return localStorage.getItem(LS_PLAYER_NAME);
}

/** Persists the player name to localStorage for future auto-rejoin. */
export function savePlayerName(name: string): void {
  localStorage.setItem(LS_PLAYER_NAME, name);
}

/** Reads the ?room= query parameter from the current URL. */
export function getRoomFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  return room && room.trim() ? room.trim().toUpperCase() : null;
}

/** Sets the ?room= param in the URL without triggering a page navigation. */
export function setRoomInUrl(room: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('room', room);
  window.history.replaceState({}, '', url.toString());
}

/** Clears the ?room= param from the URL. */
export function clearRoomFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  window.history.replaceState({}, '', url.toString());
}
