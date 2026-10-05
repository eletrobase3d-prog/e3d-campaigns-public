'use client';
import { useEffect, useRef } from 'react';

export function ReferralClick({ ticket }: { ticket: string | null }) {
  const visit = useRef<{ ticket: string; eventId: string; started: boolean } | null>(null);
  useEffect(() => {
    if (!ticket) return;
    try {
      if (!visit.current || visit.current.ticket !== ticket) visit.current = { ticket, eventId: crypto.randomUUID(), started: false };
    } catch { return; }
    const current = visit.current;
    const send = () => {
      if (document.visibilityState !== 'visible' || current.started) return;
      current.started = true;
      const body = JSON.stringify({ type: 'referral_click', eventId: current.eventId, ticket: current.ticket });
      // A lost response may be retried once using the SAME id. Tracking never blocks signup.
      const attempt = () => fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
      void (async () => {
        for (let retry = 0; retry < 2; retry++) {
          try { if ((await attempt()).status < 500) return; } catch { /* Retry using the same event id. */ }
        }
      })();
    };
    send();
    document.addEventListener('visibilitychange', send);
    return () => document.removeEventListener('visibilitychange', send);
  }, [ticket]);
  return null;
}
