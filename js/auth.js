import { API } from './api.js';
import { toast } from './ui/toast.js';
import { closePanel, closeIngredientModal } from './panel.js';

const authScreen = document.getElementById('authScreen');
const appScreen  = document.getElementById('appScreen');
const userInp = document.getElementById('username');
const pass1   = document.getElementById('pass1');
const pass2   = document.getElementById('pass2');
const USER_RE = /^[\p{L}\p{N}_]{3,30}$/u;
let mode = 'login';

document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

function setMode(m) {
  mode = m;
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  document.getElementById('pass2row').hidden = (m !== 'register');
  pass1.autocomplete = m === 'register' ? 'new-password' : 'current-password';
  document.getElementById('authTitle').textContent = m === 'register' ? 'Creá tu cuenta' : '¡Hola otra vez!';
  document.getElementById('authSub').textContent = m === 'register'
    ? 'Un usuario y una contraseña: eso es todo para empezar el viaje.'
    : 'Entrá para seguir tu recorrido gastronómico.';
  document.getElementById('authSubmit').textContent = m === 'register' ? 'Crear cuenta y entrar' : 'Entrar';
  clearError();
}
function clearError() { document.getElementById('formError').textContent = ''; }
function fail(msg) {
  document.getElementById('formError').textContent = msg;
  const c = document.querySelector('.auth-card');
  c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
}

document.querySelectorAll('.eye').forEach(b => b.addEventListener('click', () => {
  const i = document.getElementById(b.dataset.for);
  i.type = i.type === 'password' ? 'text' : 'password';
  b.textContent = i.type === 'password' ? '👁' : '🙈';
}));

userInp.addEventListener('input', () => {
  const h = document.getElementById('userHint'), v = userInp.value.trim();
  h.classList.remove('good', 'bad');
  if (!v) { h.textContent = '3–30 caracteres: letras, números o guión bajo.'; return; }
  if (!USER_RE.test(v)) { h.textContent = '✗ Solo letras, números o guión bajo (3–30).'; h.classList.add('bad'); return; }
  h.textContent = '✓'; h.classList.add('good');
});

/* El submit y el logout necesitan enterApp (definido en app.js), así que se
   conectan acá vía initAuth en lugar de puentes globales por window. */
export function initAuth(enterApp) {
  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault(); clearError();
    if (mode === 'register' && pass1.value !== pass2.value) return fail('Las contraseñas no coinciden.');
    const btn = document.getElementById('authSubmit');
    btn.disabled = true; btn.textContent = 'Un momento…';
    try {
      const res = await API.auth(mode, userInp.value.trim(), pass1.value);
      API.setTokens(res.access, res.refresh);
      await enterApp(res.username, mode === 'register', res.role);
    } catch (err) {
      fail(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar';
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', async () => {
    await API.logout();
    closePanel();
    closeIngredientModal();
    appScreen.classList.remove('on');
    authScreen.classList.add('on');
    pass1.value = ''; pass2.value = '';
    setMode('login');
    toast('Sesión cerrada. ¡Buen provecho! 🫡');
  });
}
