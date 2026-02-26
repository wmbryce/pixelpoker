import { useState } from 'react';
import { getSavedPlayerName } from '../../lib/clientSession';

interface Props {
  onCreated: (code: string, playerName: string, smallBlind: number, bigBlind: number, aiCount: number) => void;
  onBack: () => void;
}

function CreateRoomScreen({ onCreated, onBack }: Props) {
  const [roomName, setRoomName] = useState('');
  const [playerName, setPlayerName] = useState(getSavedPlayerName() ?? '');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [aiCount, setAiCount] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const handleCreate = () => {
    const errs: string[] = [];
    if (!roomName.trim()) errs.push('ROOM NAME REQUIRED');
    if (!playerName.trim()) errs.push('PLAYER NAME REQUIRED');
    if (!smallBlind || smallBlind <= 0) errs.push('SMALL BLIND MUST BE POSITIVE');
    if (!bigBlind || bigBlind <= smallBlind) errs.push('BIG BLIND MUST EXCEED SMALL BLIND');
    setErrors(errs);
    if (errs.length > 0) return;

    const suffix = Math.floor(100 + Math.random() * 900).toString();
    const code = roomName.trim().toUpperCase().replace(/\s+/g, '-') + '-' + suffix;
    onCreated(code, playerName.trim(), smallBlind, bigBlind, aiCount);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCreate();
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-3">
        {/* Room name */}
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="ROOM NAME"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>

        {/* Player name */}
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="YOUR NAME"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        {/* Blinds */}
        <div className="border-t border-vice-violet/30 pt-3">
          <p className="text-vice-muted/60 text-xs tracking-widest uppercase mb-2">Blinds</p>
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold/60 text-sm select-none">SB $</span>
              <input
                type="number"
                min={1}
                className="w-full bg-vice-bg border-2 border-vice-muted pl-10 pr-3 py-2 tracking-wider focus:outline-none focus:border-vice-gold transition-colors"
                value={smallBlind}
                onChange={(e) => setSmallBlind(Number.parseInt(e.target.value, 10))}
                onKeyDown={handleKey}
              />
            </div>
            <div className="flex-1 relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold/60 text-sm select-none">BB $</span>
              <input
                type="number"
                min={2}
                className="w-full bg-vice-bg border-2 border-vice-muted pl-10 pr-3 py-2 tracking-wider focus:outline-none focus:border-vice-gold transition-colors"
                value={bigBlind}
                onChange={(e) => setBigBlind(Number.parseInt(e.target.value, 10))}
                onKeyDown={handleKey}
              />
            </div>
          </div>
        </div>

        {/* AI players */}
        <div className="border-t border-vice-violet/30 pt-3">
          <p className="text-vice-muted/60 text-xs tracking-widest uppercase mb-2">AI Players</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setAiCount((n) => Math.max(0, n - 1))}
              className="w-9 h-9 border-2 border-vice-muted text-vice-gold font-bold text-lg btn-pixel hover:border-vice-gold transition-colors flex items-center justify-center"
            >
              −
            </button>
            <span className="flex-1 text-center text-white font-bold text-lg tracking-widest">
              {aiCount === 0 ? 'NONE' : aiCount}
            </span>
            <button
              type="button"
              onClick={() => setAiCount((n) => Math.min(5, n + 1))}
              className="w-9 h-9 border-2 border-vice-muted text-vice-gold font-bold text-lg btn-pixel hover:border-vice-gold transition-colors flex items-center justify-center"
            >
              +
            </button>
          </div>
          {aiCount > 0 && (
            <p className="text-vice-muted/50 text-xs tracking-wider mt-1 text-center">
              {aiCount} bot{aiCount > 1 ? 's' : ''} will auto-play
            </p>
          )}
        </div>

        {errors.map((err, i) => (
          <p key={i} className="text-vice-pink text-xs tracking-wide">▸ {err}</p>
        ))}
      </div>

      <button
        onClick={handleCreate}
        className="w-full bg-vice-pink text-white py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        CREATE ROOM
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

export default CreateRoomScreen;
