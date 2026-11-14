import { createBrowserRouter } from 'react-router';
import { RootLayout } from './components/RootLayout';
import { AdminPage } from './pages/AdminPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { LegalIndexPage, LegalPage } from './pages/LegalPage';
import { MapPage } from './pages/MapPage';
import { NotFoundPage } from './pages/NotFoundPage';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
    {
      element: <RootLayout />,
      children: [
        { path: '/', element: <MapPage /> },
        { path: '/pais/:countryId', element: <MapPage /> },
        { path: '/favoritos', element: <FavoritesPage /> },
        { path: '/admin', element: <AdminPage /> },
        { path: '/legales', element: <LegalIndexPage /> },
        { path: '/privacidad', element: <LegalPage slug="privacidad" /> },
        { path: '/terminos', element: <LegalPage slug="terminos" /> },
        { path: '/reembolsos', element: <LegalPage slug="reembolsos" /> },
        { path: '/cookies', element: <LegalPage slug="cookies" /> },
        { path: '/contacto', element: <LegalPage slug="contacto" /> },
        { path: '/licencias', element: <LegalPage slug="licencias" /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);
