import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../ui/ToastProvider';
import { SearchBox } from './SearchBox';

function AccountDeleteDialog({ onClose }: { onClose: () => void }) {
  const { deleteAccount } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const mutation = useMutation({
    mutationFn: () => deleteAccount(password),
    onSuccess: () => {
      toast('Cuenta eliminada. Tus datos se borraron.');
      onClose();
      navigate('/');
    },
    onError: (mutationError) => {
      setError(mutationError.message);
    },
  });

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !cardRef.current) return;
      const focusables = [
        ...cardRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => !element.hasAttribute('disabled'));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!password) {
      setError('Ingresá tu contraseña para confirmar.');
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="modal">
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Eliminar cuenta"
        ref={cardRef}
      >
        <button
          className="modal-close"
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          ref={closeRef}
        >
          ✕
        </button>
        <h4 className="ing-title">Eliminar mi cuenta</h4>
        <p className="ing-sub">
          Esta acción borra tu usuario, favoritos y sesiones. No se puede deshacer. Si sos el último
          administrador, el sistema no permitirá la baja.
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="delete-password">Contraseña actual</label>
            <div className="inp-wrap">
              <input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>
          <div className="form-error" role="alert">
            {error}
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button className="btn-primary" type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Eliminando…' : 'Eliminar cuenta'}
            </button>
            <button className="btn-ghost" type="button" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function Header() {
  const { status, user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const favoritesQuery = useQuery({
    queryKey: ['favorites'],
    queryFn: () => api.favorites(),
    enabled: status === 'authenticated',
    retry: 1,
  });

  const favoriteCount = favoritesQuery.data?.favorites.length ?? 0;

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    toast('Sesión cerrada. ¡Buen provecho! 🫡');
    navigate('/');
  };

  return (
    <header className="appbar">
      <Link className="logo" to="/">
        <span className="logo-ico" aria-hidden="true">
          🌽
        </span>
        <span className="logo-txt">
          <span className="logo-small">sabores de</span>
          <span className="logo-big">LATINOAMÉRICA</span>
        </span>
      </Link>

      {status === 'authenticated' && user ? (
        <div className="user-zone">
          <SearchBox />
          <Link className="btn-ghost" to="/favoritos" title="Mis favoritos">
            <span aria-hidden="true">⭐ {favoriteCount}</span>
            <span className="sr-only">{favoriteCount} favoritos</span>
          </Link>
          {user.role === 'admin' ? (
            <Link className="btn-ghost" to="/admin">
              🛠️ Admin
            </Link>
          ) : null}
          <div className="user-chip">
            <span
              className="avatar"
              style={{
                background: ['#f2b134', '#31c98e', '#e8709a', '#e4572e'][user.username.length % 4],
              }}
            >
              {user.username ? user.username[0]?.toUpperCase() : '🌽'}
            </span>
            <span>
              Hola, <b>{user.username}</b>
            </span>
          </div>
          <button className="btn-ghost" type="button" onClick={() => void handleLogout()}>
            Salir ↩
          </button>
          <button className="btn-ghost" type="button" onClick={() => setDeleteOpen(true)}>
            Mi cuenta
          </button>
        </div>
      ) : (
        <div className="user-zone">
          {location.pathname !== '/' ? (
            <Link className="btn-ghost" to="/">
              Entrar
            </Link>
          ) : null}
        </div>
      )}

      {deleteOpen ? <AccountDeleteDialog onClose={() => setDeleteOpen(false)} /> : null}
    </header>
  );
}
