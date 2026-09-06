const KEY = 'honeychain_current_beekeeper';
const DEFAULT_BEEKEEPER = 'BK-RAMESH';

export function getCurrentBeekeeperId() {
  return localStorage.getItem(KEY) || DEFAULT_BEEKEEPER;
}

export function setCurrentBeekeeperId(id) {
  localStorage.setItem(KEY, id);
}
