import { useState } from 'react';

interface Props {
  setupRoom: (userId: string, roomId: string, smallBlind?: number, bigBlind?: number) => void;
}

function WelcomeView({ setupRoom }: Props) {
  const [userId, setUserId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);
  const [errors, setErrors] = useState<string[]>([]);

  const handleJoin = () => {
    const newErrors: string[] = [];
    if (userId.trim().length === 0) newErrors.push('PLAYER NAME REQUIRED');
    if (roomId.trim().length === 0) newErrors.push('ROOM CODE REQUIRED');
    if (!smallBlind || smallBlind <= 0) newErrors.push('SMALL BLIND MUST BE POSITIVE');
    if (!bigBlind || bigBlind <= smallBlind) newErrors.push('BIG BLIND MUST EXCEED SMALL BLIND');
    setErrors(newErrors);
    if (newErrors.length === 0) setupRoom(userId.trim(), roomId.trim(), smallBlind, bigBlind);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div
      className="flex flex-col gap-6 justify-center items-center mx-auto mt-28 p-8 w-96 bg-vice-surface border-2 border-vice-violet"
      style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}
    >
      {/* Title */}
      <div className="text-center space-y-2 w-full">
        <div className="flex justify-center gap-3 text-vice-gold/40 text-sm mb-1">
          <span>♠</span><span>♥</span><span>♣</span><span>♦</span>
        </div>
        <h1 className="text-vice-pink text-3xl font-bold tracking-widest uppercase leading-snug">
          PIXEL POKER
        </h1>
        <p className="text-vice-gold text-base tracking-widest opacity-70">
          INSERT COIN TO PLAY
          <span className="animate-blink ml-0.5">█</span>
        </p>
        <div className="flex justify-center gap-3 text-vice-gold/40 text-sm mt-1">
          <span>♦</span><span>♣</span><span>♥</span><span>♠</span>
        </div>
        <div className="border-t border-vice-violet/40 pt-2" />
      </div>

      {/* Inputs */}
      <div className="w-full flex flex-col gap-3">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="PLAYER NAME"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-gold text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-gold transition-colors"
            placeholder="ROOM CODE"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        {/* Blinds — only matter for the room creator */}
        <div className="border-t border-vice-violet/30 pt-3">
          <p className="text-vice-muted/60 text-xs tracking-widest uppercase mb-2">
            Blinds (room creator only)
          </p>
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

        {errors.map((err, i) => (
          <p key={i} className="text-vice-pink text-sm tracking-wide">
            {'▸ '}{err}
          </p>
        ))}

        <button
          className="w-full bg-vice-pink text-white py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110 mt-1"
          onClick={handleJoin}
        >
          PRESS START
        </button>
      </div>
    </div>
  );
}

export default WelcomeView;
