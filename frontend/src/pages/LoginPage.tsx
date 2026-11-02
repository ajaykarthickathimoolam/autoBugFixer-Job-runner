import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import logo from '../assets/logo.png';
import { ThemeToggle } from '../lib/theme';

type Mode = 'signin' | 'create';

const fieldCls =
  'mb-4 w-full rounded-xl border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-950)]/70 px-3.5 py-2.5 text-sm outline-none';

export function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setConfirmPassword('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'create' && password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'create') {
        await register(username.trim(), password);
      } else {
        await login(username, password);
      }
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : mode === 'create' ? 'Could not create account' : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const creating = mode === 'create';

  return (
    <div className="bg-app-wallpaper relative flex min-h-screen items-center justify-center px-5 py-12">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full bg-[color:var(--color-accent-primary)]/20 blur-3xl" />
      </div>

      <div className="relative w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="" className="mb-4 h-16 w-16 rounded-2xl shadow-[0_16px_40px_-16px_rgba(139,156,255,0.85)]" />
          <h1 className="text-3xl font-semibold tracking-tight">
            Code<span className="text-[color:var(--color-accent-primary)]">Healer</span>
          </h1>
          <p className="mt-1.5 text-sm text-[color:var(--color-text-400)]">Automated bug-fix pipeline</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="glow-border rounded-3xl p-7 backdrop-blur-md"
        >
          <div className="mb-6 flex gap-1 rounded-2xl border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-950)]/50 p-1">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                !creating
                  ? 'bg-[color:var(--color-accent-primary)]/16 text-[color:var(--color-text-100)]'
                  : 'text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode('create')}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                creating
                  ? 'bg-[color:var(--color-accent-primary)]/16 text-[color:var(--color-text-100)]'
                  : 'text-[color:var(--color-text-400)] hover:text-[color:var(--color-text-100)]'
              }`}
            >
              Create account
            </button>
          </div>

          <h2 className="mb-1 text-lg font-semibold">{creating ? 'Create your account' : 'Welcome back'}</h2>
          <p className="mb-6 text-sm text-[color:var(--color-text-400)]">
            {creating
              ? 'Your account can open every page, including projects, the board, and admin.'
              : 'Sign in to mission control.'}
          </p>

          <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-400)]">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={creating ? 'your.name' : 'sarathi'}
            autoComplete="username"
            autoFocus
            className={fieldCls}
          />

          <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-400)]">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete={creating ? 'new-password' : 'current-password'}
            className={creating ? fieldCls : `${fieldCls} mb-3`}
          />

          {creating && (
            <>
              <label className="mb-1.5 block text-xs font-medium text-[color:var(--color-text-400)]">Confirm password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className="mb-6 w-full rounded-xl border border-[color:var(--color-border-800)] bg-[color:var(--color-bg-950)]/70 px-3.5 py-2.5 text-sm outline-none"
              />
            </>
          )}

          {!creating && (
            <p className="mb-6 text-xs leading-relaxed text-[color:var(--color-text-600)]">
              First-time local login:{' '}
              <span className="font-mono-brand text-[color:var(--color-text-400)]">sarathi</span>
              {' / '}
              <span className="font-mono-brand text-[color:var(--color-text-400)]">sarathi@7</span>
              . That account is the seeded super admin.
            </p>
          )}

          {error && (
            <p className="mb-4 rounded-xl border border-[color:var(--color-accent-red)]/30 bg-[color:var(--color-accent-red)]/10 px-3 py-2 text-sm text-[color:var(--color-accent-red)]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || (creating && (!username.trim() || password.length < 8 || !confirmPassword))}
            className="w-full rounded-xl bg-[color:var(--color-accent-primary)] px-4 py-2.5 text-sm font-semibold text-[color:var(--color-on-accent)] shadow-[0_10px_30px_-12px_rgba(139,156,255,0.9)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (creating ? 'Creating account…' : 'Signing in…') : creating ? 'Create account' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
