import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

/** GSAP compartido: un solo registro para toda la app. */
export { gsap, useGSAP };

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ejecuta `callback` solo si la persona no pidió reducir movimiento. */
export function motionIfAllowed(callback: () => void): void {
  if (!prefersReducedMotion()) callback();
}
