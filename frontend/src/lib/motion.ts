import { gsap } from 'gsap';

/** GSAP compartido: un solo punto de entrada para toda la app. */
export { gsap };

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
