import { useNavigate } from 'react-router';
import { FavoritesPanel } from '../panel/FavoritesPanel';

export function FavoritesPage() {
  const navigate = useNavigate();
  return (
    <main className="main" id="main-content" style={{ minHeight: '60vh' }}>
      <FavoritesPanel onClose={() => navigate('/')} />
    </main>
  );
}
