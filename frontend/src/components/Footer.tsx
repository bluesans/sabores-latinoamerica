import { Link } from 'react-router';
import { useConsent } from '../consent/ConsentContext';

export function Footer() {
  const { openBanner } = useConsent();
  return (
    <footer className="foot">
      <nav className="foot-links" aria-label="Enlaces legales">
        <Link to="/privacidad">Privacidad</Link>
        <Link to="/terminos">Términos</Link>
        <Link to="/cookies">Cookies</Link>
        <Link to="/reembolsos">Reembolsos</Link>
        <Link to="/licencias">Licencias</Link>
        <Link to="/contacto">Contacto</Link>
        <button type="button" onClick={openBanner}>
          Preferencias de cookies
        </button>
      </nav>
      <p>Sabores de Latinoamérica — hecho con maíz, ají y React 🌽</p>
      <p style={{ marginTop: '0.4rem', fontSize: '0.78rem' }}>
        Proyecto educativo sin fines de venta. Contenido gastronómico de referencia; revisá siempre
        las preparaciones y alérgenos.
      </p>
    </footer>
  );
}
