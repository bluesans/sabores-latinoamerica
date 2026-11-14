export function formatTime(minutes: number): string {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) return '—';
  const value = Number(minutes) || 0;
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function safeYoutubeId(value: string | null | undefined): string {
  const cleaned = String(value ?? '').replace(/\s+/g, '');
  return /^[A-Za-z0-9_-]{11}$/.test(cleaned) ? cleaned : '';
}

export const USERNAME_PATTERN = /^[\p{L}\p{N}_]{3,30}$/u;
