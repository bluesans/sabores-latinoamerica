import Lenis from 'lenis';
import { useEffect } from 'react';

export function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ autoRaf: true, smoothWheel: true });
    return () => lenis.destroy();
  }, []);
  return null;
}
