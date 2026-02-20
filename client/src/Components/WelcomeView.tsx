import { useState } from 'react';

interface Props {
  setupRoom: (userId: string, roomId: string) => void;
}

function WelcomeView({ setupRoom }: Props) {
  const [userId, setUserId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const handleJoin = () => {
    const newErrors: string[] = [];
    if (userId.trim().length === 0) newErrors.push('PLAYER NAME REQUIRED');
    if (roomId.trim().length === 0) newErrors.push('ROOM CODE REQUIRED');
    setErrors(newErrors);
    if (newErrors.length === 0) setupRoom(userId.trim(), roomId.trim());
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
        <h1 className="text-vice-pink text-3xl font-bold tracking-widest uppercase leading-snug">
          ♦ PIXEL POKER ♦
        </h1>
        <p className="text-vice-cyan text-lg tracking-widest opacity-80">
          INSERT COIN TO PLAY
          <span className="animate-blink ml-0.5">█</span>
        </p>
        <div className="border-t border-vice-violet/40 pt-2" />
      </div>

      {/* Inputs */}
      <div className="w-full flex flex-col gap-3">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-cyan text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 text-white uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-cyan transition-colors"
            placeholder="PLAYER NAME"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-vice-cyan text-base select-none">▶</span>
          <input
            className="w-full bg-vice-bg border-2 border-vice-muted pl-7 pr-3 py-2 text-white uppercase tracking-wider placeholder-vice-muted/50 focus:outline-none focus:border-vice-cyan transition-colors"
            placeholder="ROOM CODE"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={handleKey}
          />
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
