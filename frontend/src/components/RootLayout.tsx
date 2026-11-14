import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { AuthScreen } from '../auth/AuthScreen';
import { CookieBanner } from '../components/CookieBanner';
import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { SmoothScroll } from '../components/SmoothScroll';
import { IngredientModalProvider } from '../panel/IngredientModal';

const PUBLIC_PREFIXES = [
  '/privacidad',
  '/terminos',
  '/reembolsos',
  '/cookies',
  '/contacto',
  '/licencias',
  '/legales',
];

export function RootLayout() {
  const { status } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const previousPath = useRef(location.pathname);

  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => location.pathname === prefix || location.pathname.startsWith(`${prefix}/`),
  );
  const needsAuth = !isPublic;

  useEffect(() => {
    if (status === 'guest') {
      void queryClient.cancelQueries();
      queryClient.clear();
    }
  }, [status, queryClient]);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (location.pathname.startsWith('/pais/') || location.pathname === '/') return;
    const root = document.getElementById('main-content');
    if (root) {
      root.setAttribute('tabindex', '-1');
      root.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  if (status === 'probing') {
    return <div className="page-loading">Ubicando tu mesa…</div>;
  }

  if (status === 'guest' && needsAuth) {
    return <AuthScreen />;
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Saltar al contenido
      </a>
      <SmoothScroll />
      <IngredientModalProvider>
        <Header />
        <Outlet />
        <Footer />
      </IngredientModalProvider>
      <CookieBanner />
    </>
  );
}
