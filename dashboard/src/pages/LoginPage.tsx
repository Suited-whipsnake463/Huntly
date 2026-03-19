import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/campaigns', {
        headers: { 'x-api-key': key },
      });
      if (!res.ok) throw new Error('Invalid API key');
      localStorage.setItem('huntly_api_key', key);
      navigate('/');
    } catch {
      setError('Invalid API key. Check and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-6 rounded-xl border border-gray-800 bg-gray-900 p-8"
      >
        <div className="flex flex-col items-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-cyan-500 flex items-center justify-center text-gray-950 font-bold text-xl">
            H
          </div>
          <h1 className="text-xl font-semibold text-gray-100">Huntly Admin</h1>
          <p className="text-sm text-gray-400">Enter your API key to continue</p>
        </div>

        <div>
          <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-1.5">
            API Key
          </label>
          <input
            id="api-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="hntl_..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            required
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-gray-950 hover:bg-cyan-400 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Validating...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
