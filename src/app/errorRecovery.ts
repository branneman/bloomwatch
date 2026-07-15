export function recoverFromError(): void {
  window.location.hash = "#/";
  window.location.reload();
}
