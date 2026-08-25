import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import logoLarge from '../assets/logo-large.png';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
      <div className="bg-app-wallpaper grid min-h-screen grid-cols-1 md:grid-cols-2">
        <div className="flex flex-col items-center justify-center px-8 py-16">
          <div className="relative h-72 w-72 sm:h-96 sm:w-96 lg:h-[28rem] lg:w-[28rem]">
            <img
                src={logoLarge}
                alt="CodeHealer"
                className="h-full w-full rounded-3xl object-contain drop-shadow-[0_0_80px_rgba(99,102,241,0.35)]"
            />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1 rounded-b-3xl bg-gradient-to-t from-black/85 via-black/50 to-transparent px-4 pb-5 pt-12 text-center">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">CodeHealer</h1>
              <p className="text-xs text-[color:var(--color-text-400)] sm:text-sm">Automated bug-fix pipeline</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-8 py-16">
          <form
              onSubmit={handleSubmit}
              className="glow-border w-full max-w-sm rounded-2xl bg-[color:var(--color-panel-900)]/90 p-8 backdrop-blur-sm"
          >
            <h2 className="mb-6 text-lg font-semibold text-[color:var(--color-text-100)]">Sign in</h2>

            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Username</label>
            <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="sarathi"
                autoComplete="username"
                autoFocus
                className="mb-4 w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]"
            />

            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-400)]">Password</label>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="sarathi@7"
                autoComplete="current-password"
                className="mb-2 w-full rounded-lg border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-900)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent-primary)]"
            />
            <p className="mb-6 text-xs text-[color:var(--color-text-600)]">
              First-time local login: <span className="font-mono-brand text-[color:var(--color-text-400)]">sarathi</span>
              {' / '}
              <span className="font-mono-brand text-[color:var(--color-text-400)]">sarathi@7</span>
              . That account is the seeded super admin — User Management stays empty until you add more people.
            </p>

            {error && <p className="mb-4 text-sm text-[color:var(--color-accent-red)]">{error}</p>}

            <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[color:var(--color-accent-primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
  );
}
