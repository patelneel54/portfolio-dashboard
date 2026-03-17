import { api } from '../hooks/useApi';

/**
 * Check if push notifications are supported.
 * Requires service worker + PushManager + Notification API.
 */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get current notification permission state.
 * @returns {'granted' | 'denied' | 'default' | 'unsupported'}
 */
export function getPermissionState() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Convert a base64 VAPID key to Uint8Array for subscribe().
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to push notifications.
 * Requests permission, creates PushSubscription, sends to server.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function subscribeToPush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported on this device.' };
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission denied.' };
    }

    // Get VAPID key from server
    const { publicKey } = await api.getVapidKey();
    if (!publicKey) {
      return { success: false, error: 'Push notifications are not configured on the server.' };
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // Send subscription to server
    const subJson = subscription.toJSON();
    await api.pushSubscribe({
      endpoint: subJson.endpoint,
      keys: subJson.keys,
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to subscribe to push notifications.' };
  }
}

/**
 * Unsubscribe from push notifications.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const subJson = subscription.toJSON();
      await subscription.unsubscribe();
      await api.pushUnsubscribe({
        endpoint: subJson.endpoint,
        keys: subJson.keys,
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to unsubscribe.' };
  }
}

/**
 * Check if the user is currently subscribed to push.
 * @returns {Promise<boolean>}
 */
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

/**
 * Send a test notification via the server.
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendTestNotification() {
  try {
    await api.pushTest();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message || 'Test notification failed.' };
  }
}
