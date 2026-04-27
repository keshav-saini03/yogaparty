'use client';

import { useEffect } from 'react';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ReferralCapture() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const ref = url.searchParams.get('ref');
    if (!ref) return;
    if (!UUID_RE.test(ref)) return;
    localStorage.setItem('yp_ref', ref);
    url.searchParams.delete('ref');
    window.history.replaceState({}, '', url.toString());
  }, []);
  return null;
}
