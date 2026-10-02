import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// On-device daily reminder (no server/push needed — works on the free iOS path).
const REMINDER_ID = 1001;
export const isNative = Capacitor.isNativePlatform();

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  let p = await LocalNotifications.checkPermissions();
  if (p.display !== 'granted') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

/** Schedule (or reschedule) a repeating daily reminder at the given local time. */
export async function scheduleDailyReminder(hour: number, minute: number): Promise<boolean> {
  if (!isNative) return false;
  if (!(await ensureNotificationPermission())) return false;
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
  await LocalNotifications.schedule({
    notifications: [
      {
        id: REMINDER_ID,
        title: 'Log today’s spending 💸',
        body: 'Tap to add an expense before you forget.',
        schedule: { on: { hour, minute }, allowWhileIdle: true }, // repeats daily
        extra: { open: 'add' },
      },
    ],
  });
  return true;
}

export async function cancelDailyReminder(): Promise<void> {
  if (!isNative) return;
  await LocalNotifications.cancel({ notifications: [{ id: REMINDER_ID }] });
}
