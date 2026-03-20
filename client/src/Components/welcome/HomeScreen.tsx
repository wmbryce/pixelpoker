interface Props {
  onCreate: () => void;
  onJoin: () => void;
  onQuickPlay: () => void;
  onTraining: () => void;
}

function HomeScreen({ onCreate, onJoin, onQuickPlay, onTraining }: Props) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <button
        onClick={onQuickPlay}
        className="w-full bg-vice-gold text-vice-bg py-4 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ▶ QUICK PLAY
      </button>
      <button
        onClick={onCreate}
        className="w-full bg-vice-pink text-white py-4 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ✦ CREATE ROOM
      </button>
      <button
        onClick={onJoin}
        className="w-full bg-vice-cyan text-vice-bg py-4 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ▶ JOIN ROOM
      </button>
      <button
        onClick={onTraining}
        className="w-full bg-vice-violet text-white py-4 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ▶ TRAINING
      </button>
    </div>
  );
}

export default HomeScreen;
