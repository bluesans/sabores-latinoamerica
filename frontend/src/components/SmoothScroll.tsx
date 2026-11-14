import Lenis from 'lenis';
import { useEffect } from 'react';
import { prefersReducedMotion } from '../lib/motion';

export function SmoothScroll() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const lenis = new Lenis({ autoRaf: true, smoothWheel: true });
    return () => lenis.destroy();
  }, []);
  return null;
}
