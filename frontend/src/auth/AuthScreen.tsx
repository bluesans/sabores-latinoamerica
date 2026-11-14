import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { CONSENT_VERSION } from '../consent/ConsentContext';
import { USERNAME_PATTERN } from '../lib/format';
import { useToast } from '../ui/ToastProvider';

type Mode = 'login' | 'register';

const DISHES =
  '🇲🇽 Tacos al pastor · 🇵🇪 Ceviche · 🇦🇷 Asado criollo · 🇨🇴 Bandeja paisa · 🇻🇪 Arepa · 🇧🇷 Feijoada · 🇨🇱 Pastel de choclo · 🇪🇨 Ceviche de camarón · 🇧🇴 Salteña · 🇨🇺 Ropa vieja · 🇺🇾 Chivito · 🇩🇴 Mangú · ';

const PENNANTS = Array.from({ length: 16 }, (_, index) => ({
  id: `pennant-${index}`,
  color: ['#f2b134', '#e4572e', '#31c98e', '#e8709a', '#3aa7c9'][index % 5],
}));

export function AuthScreen() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setPassword2('');
    if (next === 'login') {
      setAcceptTerms(false);
      setAcceptPrivacy(false);
      setAgeConfirmed(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const cleanUsername = username.trim();
    if (!USERNAME_PATTERN.test(cleanUsername)) {
      setError('El usuario debe tener 3–30 caracteres: letras, números o guión bajo.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (mode === 'register') {
      if (password !== password2) {
        setError('Las contraseñas no coinciden.');
        return;
      }
      if (!acceptTerms || !acceptPrivacy || !ageConfirmed) {
        setError(
          'Para crear la cuenta tenés que aceptar los términos, la privacidad y confirmar tu edad.',
        );
        return;
      }
    }
    setSubmitting(true);
    try {
      if (mode === 'register') {
        await register(cleanUsername, password, {
          accept_terms: true,
          accept_privacy: true,
          age_confirmed: true,
        });
        toast(`¡Cuenta creada! Bienvenido, ${cleanUsername} 🌶️`);
      } else {
        await login(cleanUsername, password);
        toast(`Hola de nuevo, ${cleanUsername} 👋`);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'No se pudo completar la operación.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const userHint = (() => {
    const value = username.trim();
    if (!value)
      return { text: '3–30 caracteres: letras, números o guión bajo.', className: 'hint' };
    if (!USERNAME_PATTERN.test(value)) {
      return { text: '✗ Solo letras, números o guión bajo (3–30).', className: 'hint bad' };
    }
    return { text: '✓', className: 'hint good' };
  })();

  return (
    <section className="screen auth on">
      <div className="auth-left">
        <div className="pennants" aria-hidden="true">
          {PENNANTS.map((pennant, index) => (
            <span
              key={pennant.id}
              style={{
                ['--i' as string]: index,
                background: pennant.color,
              }}
            />
          ))}
        </div>
        <div className="kicker">🌶️ Atlas interactivo de gastronomía</div>
        <h1 className="brand-title">
          Sabores de<em>Latinoamérica</em>
        </h1>
        <p className="brand-lead">
          Una enciclopedia gastronómica para recorrer el continente plato por plato. Elegí un país
          en el mapa y descubrí sus recetas emblemáticas: ingredientes, dificultad, tiempos y video
          paso a paso.
        </p>
        <ul className="brand-points">
          <li>
            <span>🗺️</span>
            <div>
              <b>Mapa interactivo</b> con zoom: viajá país por país.
            </div>
          </li>
          <li>
            <span>🍲</span>
            <div>
              <b>Recetas icónicas</b> por cada destino.
            </div>
          </li>
          <li>
            <span>🏷️</span>
            <div>
              <b>Ingredientes, dificultad</b> y tiempo estimado.
            </div>
          </li>
          <li>
            <span>🎬</span>
            <div>
              <b>Video paso a paso</b> para cocinarlas en casa.
            </div>
          </li>
        </ul>
        <div className="marquee" aria-hidden="true">
          <div className="marquee-track">
            <span>{DISHES}</span>
            <span>{DISHES}</span>
          </div>
        </div>
      </div>

      <div className="auth-right">
        <form className={`auth-card${error ? ' shake' : ''}`} noValidate onSubmit={handleSubmit}>
          <div className="tabs" role="tablist" aria-label="Acceso">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`tab${mode === 'login' ? ' on' : ''}`}
              onClick={() => switchMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`tab${mode === 'register' ? ' on' : ''}`}
              onClick={() => switchMode('register')}
            >
              Crear cuenta
            </button>
          </div>
          <h2>{mode === 'register' ? 'Creá tu cuenta' : '¡Hola otra vez!'}</h2>
          <p className="auth-sub">
            {mode === 'register'
              ? 'Un usuario y una contraseña: eso es todo para empezar el viaje.'
              : 'Entrá para seguir tu recorrido gastronómico.'}
          </p>

          <div className="field">
            <label htmlFor="username">Usuario</label>
            <div className="inp-wrap">
              <input
                id="username"
                maxLength={30}
                autoComplete="username"
                placeholder="p. ej. chef_querubin"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className={userHint.className}>{userHint.text}</div>
          </div>

          <div className="field">
            <label htmlFor="pass1">Contraseña</label>
            <div className="inp-wrap">
              <input
                id="pass1"
                type={showPassword ? 'text' : 'password'}
                maxLength={72}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder="••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="eye"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {mode === 'register' ? (
            <>
              <div className="field">
                <label htmlFor="pass2">Repetí la contraseña</label>
                <div className="inp-wrap">
                  <input
                    id="pass2"
                    type={showPassword ? 'text' : 'password'}
                    maxLength={72}
                    autoComplete="new-password"
                    placeholder="••••••"
                    value={password2}
                    onChange={(event) => setPassword2(event.target.value)}
                  />
                </div>
              </div>
              <fieldset className="consent-block">
                <legend className="sr-only">Consentimientos obligatorios</legend>
                <label>
                  <input
                    type="checkbox"
                    checked={acceptTerms}
                    onChange={(event) => setAcceptTerms(event.target.checked)}
                  />
                  <span>
                    Acepto los <Link to="/terminos">términos de uso</Link>.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={acceptPrivacy}
                    onChange={(event) => setAcceptPrivacy(event.target.checked)}
                  />
                  <span>
                    Acepto la <Link to="/privacidad">política de privacidad</Link>.
                  </span>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(event) => setAgeConfirmed(event.target.checked)}
                  />
                  <span>Confirmo que tengo 13 años o más.</span>
                </label>
              </fieldset>
            </>
          ) : null}

          <div className="form-error" role="alert">
            {error}
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Un momento…' : mode === 'register' ? 'Crear cuenta y entrar' : 'Entrar'}
          </button>
          <p className="auth-note">
            Las cuentas se validan contra la base de datos local. Versión de consentimiento:{' '}
            {CONSENT_VERSION}. <Link to="/privacidad">Privacidad</Link>.
          </p>
        </form>
      </div>
    </section>
  );
}
