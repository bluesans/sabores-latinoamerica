import { Link } from 'react-router';
import { useConsent } from '../consent/ConsentContext';

export function CookieBanner() {
  const { bannerOpen, acceptAll, rejectAll } = useConsent();
  if (!bannerOpen) return null;
  return (
    <section className="cookie-banner" aria-label="Preferencias de cookies">
      <div className="cookie-inner">
        <p>
          Usamos una cookie necesaria para mantener tu sesión. Los videos de YouTube son de terceros
          y solo se cargan si los aceptás. Podés rechazarlos y seguir usando el sitio.{' '}
          <Link to="/cookies">Ver detalle</Link>.
        </p>
        <div className="cookie-actions">
          <button className="cookie-btn" type="button" onClick={rejectAll}>
            Rechazar
          </button>
          <button className="cookie-btn" type="button" onClick={acceptAll}>
            Aceptar todas
          </button>
        </div>
      </div>
    </section>
  );
}
