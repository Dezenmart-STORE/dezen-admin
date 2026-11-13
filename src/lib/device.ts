import { useEffect, useRef, useState } from 'react';
import type { QueueItem } from '../store/types';

/** Online or not, kept current. Money actions are refused while offline; nothing is queued for later. */
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Install the service worker in production builds (it would get in the way of live reload). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* the app works without it */
    });
  });
}

const ALERTS_KEY = 'dezen-admin-alerts';
const alertsOn = () => {
  try {
    return localStorage.getItem(ALERTS_KEY) === 'on';
  } catch {
    return false;
  }
};

/** Whether this browser can show alerts, and the person's choice. */
export function useAlertSetting() {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [enabled, setEnabled] = useState(() => supported && alertsOn() && Notification.permission === 'granted');
  const turnOn = async () => {
    if (!supported) return false;
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    const ok = permission === 'granted';
    try {
      localStorage.setItem(ALERTS_KEY, ok ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    setEnabled(ok);
    return ok;
  };
  const turnOff = () => {
    try {
      localStorage.setItem(ALERTS_KEY, 'off');
    } catch {
      /* storage unavailable */
    }
    setEnabled(false);
  };
  return { supported, enabled, blocked: supported && Notification.permission === 'denied', turnOn, turnOff };
}

/**
 * While the admin is open, alert when an urgent queue grows (a payment failed, a refund became due,
 * an approval is waiting). One alert per queue, replacing the last. Alerts while the admin is closed
 * need backend push; see the checklist.
 */
export function useUrgentAlerts(queues: QueueItem[] | undefined, enabled: boolean) {
  const seen = useRef<Record<string, number> | null>(null);
  useEffect(() => {
    if (!queues) return;
    const counts = Object.fromEntries(queues.map((q) => [q.key, q.count]));
    const before = seen.current;
    seen.current = counts;
    if (!before || !enabled || Notification.permission !== 'granted') return;
    for (const q of queues) {
      const added = q.count - (before[q.key] ?? 0);
      if (!q.urgent || added <= 0) continue;
      const body = `${added} new · ${q.count} waiting${q.amountAtStake ? ` · ₦${q.amountAtStake.toLocaleString('en-NG')}` : ''}`;
      const options: NotificationOptions = { body, tag: q.key, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { link: q.link } };
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.ready.then((reg) => reg.showNotification(q.label, options)).catch(() => new Notification(q.label, options));
      } else {
        const n = new Notification(q.label, options);
        n.onclick = () => {
          window.focus();
          window.location.assign(q.link);
        };
      }
    }
  }, [queues, enabled]);
}
