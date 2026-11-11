/**
 * Minimal browser event bridge for the notifications counter.
 *
 * The shell renders the topbar and the notifications page renders the list, so
 * they cannot share React state. A window event keeps the unread counter in
 * sync without adding a dependency or a global store.
 */
export const NOTIFICATIONS_CHANGED = 'smartlogi:notifications-changed';

export function emitNotificationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function subscribeNotificationsChanged(handler: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(NOTIFICATIONS_CHANGED, handler);
  return () => window.removeEventListener(NOTIFICATIONS_CHANGED, handler);
}
