/* Verifica contraste AA de los pares texto/fondo reales de los tokens.
   Normal: >= 4.5:1; texto grande (>=24px o 19px bold) y componentes: >= 3:1. */
const pairs = [
  ['cream/ink', '#f4ead6', '#0c1310', 4.5],
  ['muted/ink', '#9db3a6', '#0c1310', 4.5],
  ['muted/panel', '#9db3a6', '#121d17', 4.5],
  ['muted/auth', '#9db3a6', '#101a15', 4.5],
  ['cream/panel2', '#f4ead6', '#16231c', 4.5],
  ['body/panel2', '#d8e4dc', '#16231c', 4.5],
  ['body/panel', '#d8e4dc', '#15211b', 4.5],
  ['muted/dark', '#9db3a6', '#0d1611', 4.5],
  ['chip/dark', '#cfe3d6', '#0e1a14', 4.5],
  ['hint-bad/ink', '#ff9f8a', '#0c1310', 4.5],
  ['error/panel2', '#ffb59f', '#16231c', 4.5],
  ['yellow-tag/dark', '#ffd37a', '#0e1a14', 4.5],
  ['jade-tag/dark', '#7ce6bb', '#0e1a14', 4.5],
  ['brown/yellow', '#241a05', '#f2b134', 4.5],
  ['yellow/ink-large', '#f2b134', '#0c1310', 3],
  ['aji/ink-large', '#e4572e', '#0c1310', 3],
  ['jade/ink-large', '#31c98e', '#0c1310', 3],
  ['rosa/ink-large', '#e8709a', '#0c1310', 3],
  ['focus/yellow-vs-ink', '#f2b134', '#0c1310', 3],
];

function luminance(hex) {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(
    (offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255,
  );
  const [r, g, b] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

let failed = 0;
for (const [name, fg, bg, minimum] of pairs) {
  const value = ratio(fg, bg);
  const status = value >= minimum ? 'OK ' : 'FAIL';
  if (status === 'FAIL') failed += 1;
  console.log(`${status} ${name.padEnd(24)} ${value.toFixed(2)}:1 (min ${minimum})`);
}
if (failed) {
  console.error(`\n${failed} par(es) no cumplen AA.`);
  process.exit(1);
}
console.log('\nTodos los pares cumplen AA.');
