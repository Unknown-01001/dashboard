export function confirmAction(message) {
  return Promise.resolve(window.confirm(message));
}
