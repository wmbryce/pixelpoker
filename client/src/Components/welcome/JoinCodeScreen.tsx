import { useState } from 'react';

const SERVER_URL = 'http://localhost:8000';

interface Props {
  onFound: (code: string) => void;
  onNotFound: (code: string) => void;
  onBack: () => void;
}

function JoinCodeScreen({ onFound, onNotFound, onBack }: Props) {
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const handleFind = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError('ROOM CODE REQUIRED');
      return;
    }
    setError('');
    setChecking(true);
    try {
      const res = await fetch(`${SERVER_URL}/rooms/${encodeURIComponent(trimmed)}`);
      const { exists } = await res.json() as { exists: boolean };
      if (exists) {
        onFound(trimmed);
      } else {
        onNotFound(trimmed);
      }
    } catch {
      setError('COULD NOT REACH SERVER');
    } finally {
      setChecking(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFind();
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-3">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="ROOM CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>
        {error && <p className="text-vice-pink text-xs tracking-wide">▸ {error}</p>}
      </div>

      <button
        onClick={handleFind}
        disabled={checking}
        className="w-full bg-vice-cyan text-vice-bg py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110 disabled:opacity-50"
      >
        {checking ? 'SEARCHING…' : 'FIND ROOM'}
      </button>
      <button
        onClick={onBack}
        className="w-full text-vice-muted text-xs tracking-widest uppercase hover:text-white transition-colors py-1"
      >
        ← BACK
      </button>
    </div>
  );
}

export default JoinCodeScreen;
