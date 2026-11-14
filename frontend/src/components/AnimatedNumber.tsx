import gsap from 'gsap';
import { useEffect, useRef } from 'react';

export function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      element.textContent = String(value);
      return;
    }
    const holder = { current: 0 };
    const tween = gsap.to(holder, {
      current: value,
      duration: 1.3,
      ease: 'power3.out',
      onUpdate: () => {
        element.textContent = String(Math.round(holder.current));
      },
      onComplete: () => {
        element.textContent = String(value);
      },
    });
    return () => {
      tween.kill();
    };
  }, [value]);

  return <span className="stat-num" ref={ref} />;
}
