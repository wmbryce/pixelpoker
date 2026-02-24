import { useState } from 'react';

interface Props {
  roomCode: string;
  onJoin: (playerName: string) => void;
  onBack: () => void;
}

function JoinNameScreen({ roomCode, onJoin, onBack }: Props) {
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');

  const handleJoin = () => {
    if (!playerName.trim()) {
      setError('PLAYER NAME REQUIRED');
      return;
    }
    onJoin(playerName.trim());
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-vice-cyan text-xs tracking-widest">
          <span>■</span>
          <span>ROOM <span className="text-vice-gold font-bold">{roomCode}</span> FOUND</span>
        </div>

        <div className="relative mt-1">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="YOUR NAME"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>
        {error && <p className="text-vice-pink text-xs tracking-wide">▸ {error}</p>}
      </div>

      <button
        onClick={handleJoin}
        className="w-full bg-vice-cyan text-vice-bg py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        JOIN ROOM ▶
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

export default JoinNameScreen;
