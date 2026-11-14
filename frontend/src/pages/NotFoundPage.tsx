import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="legal-wrap" id="main-content">
      <header className="legal-hero">
        <h1>404 — Esta receta no existe</h1>
        <p>La página que buscás no está en el atlas.</p>
      </header>
      <p>
        <Link to="/">← Volver al mapa del sabor</Link>
      </p>
    </main>
  );
}
