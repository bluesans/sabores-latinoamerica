import { Link } from 'react-router';
import { legalIndex, legalPages, OWNER, REVIEW_NOTICE } from '../content/legal/pages';
import { NotFoundPage } from './NotFoundPage';

export function LegalPage({ slug }: { slug: string }) {
  const page = legalPages[slug];
  if (!page) return <NotFoundPage />;
  return (
    <main className="legal-wrap" id="main-content">
      <header className="legal-hero">
        <h1>{page.title}</h1>
        <p>{page.subtitle}</p>
        <span className="review-note">{REVIEW_NOTICE}</span>
      </header>
      <div className="legal-body">{page.body}</div>
      <hr style={{ borderColor: 'var(--line)', margin: '2rem 0 1.2rem' }} />
      <dl className="owner-data">
        <dt>Titular</dt>
        <dd>{OWNER.name}</dd>
        <dt>Correo</dt>
        <dd>{OWNER.email}</dd>
        <dt>Jurisdicción</dt>
        <dd>{OWNER.jurisdiction}</dd>
        <dt>Actualización</dt>
        <dd>{OWNER.updated}</dd>
      </dl>
      <p style={{ marginTop: '1rem' }}>
        <Link to="/legales">← Todos los documentos legales</Link>
      </p>
    </main>
  );
}

export function LegalIndexPage() {
  return (
    <main className="legal-wrap" id="main-content">
      <header className="legal-hero">
        <h1>Documentos legales</h1>
        <p>Transparencia sobre datos, cookies, términos y créditos.</p>
        <span className="review-note">{REVIEW_NOTICE}</span>
      </header>
      <ul className="legal-index">
        {legalIndex.map((item) => (
          <li key={item.slug}>
            <Link to={`/${item.slug}`}>
              <strong>{item.label}</strong>
              <span
                style={{
                  display: 'block',
                  color: 'var(--muted)',
                  fontWeight: 400,
                  fontSize: '0.88rem',
                }}
              >
                {item.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
