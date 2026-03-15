/** Trigger a short haptic pulse (10ms) on supported devices. No-op on unsupported platforms. */
export function haptic() {
  if (navigator.vibrate) navigator.vibrate(10);
}
