'use client';
import { useEffect, useId, useState } from 'react';
import { usePathname } from 'next/navigation';

const eventName = 'e3d-action-feedback';
const storageKey = 'e3d-action-feedback';
export function notifyAction(message: string, afterNavigation = false, owner?: string) {
  window.dispatchEvent(new CustomEvent(eventName, { detail: { message, owner } }));
  if (afterNavigation && message) {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ message, at: Date.now() })); } catch { /* Feedback remains visible on this page. */ }
  }
}

export function useActionFeedback() {
  const [message, setMessage] = useState('');
  const owner = useId();
  useEffect(() => {
    const clearPrevious = (event: Event) => {
      if ((event as CustomEvent).detail.owner !== owner) setMessage('');
    };
    window.addEventListener(eventName, clearPrevious);
    return () => window.removeEventListener(eventName, clearPrevious);
  }, [owner]);
  function update(message: string) { setMessage(message); notifyAction(message, false, owner); }
  return [message, update] as const;
}

export function ActionFeedback() {
  const [notice, setNotice] = useState({ message: '', sequence: 0 });
  const pathname = usePathname();
  useEffect(() => {
    const listener = (event: Event) => setNotice(previous => ({ message: String((event as CustomEvent).detail.message), sequence: previous.sequence + 1 }));
    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, []);
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved);
        if (typeof value.message === 'string' && Date.now() - value.at < 30000) {
          setNotice(previous => ({ message: value.message, sequence: previous.sequence + 1 }));
        }
      }
    } catch { /* Storage may be disabled. */ }
  }, [pathname]);
  useEffect(() => {
    if (!notice.message) return;
    const timer = window.setTimeout(() => setNotice(previous => ({ ...previous, message: '' })), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return <div role="status" aria-live="polite" aria-atomic="true" style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, maxWidth: 'min(420px, calc(100vw - 32px))', pointerEvents: 'none' }}>
    {notice.message && <div key={notice.sequence} style={{ background: '#15263b', color: '#fff', border: '1px solid #8ca9cc', padding: 16, borderRadius: 10, boxShadow: '0 4px 24px #0006' }}>{notice.message}</div>}
  </div>;
}
