interface Props {
  roomCode: string;
  onEnter: () => void;
}

function RoomCreatedScreen({ roomCode, onEnter }: Props) {
  return (
    <div className="flex flex-col gap-5 w-full items-center">
      <div className="w-full text-center flex flex-col gap-2">
        <p className="text-vice-muted text-xs tracking-widest uppercase">Room created! Share this code:</p>
        <div
          className="w-full py-4 bg-vice-bg border-2 border-vice-gold text-vice-gold text-2xl font-bold tracking-[0.3em] uppercase text-center"
          style={{ textShadow: '0 0 12px #FFB80060' }}
        >
          {roomCode}
        </div>
        <p className="text-vice-muted/50 text-xs tracking-wider">
          Friends enter this code to join your table
        </p>
      </div>

      <button
        onClick={onEnter}
        className="w-full bg-vice-pink text-white py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
      >
        ENTER ROOM ▶
      </button>
    </div>
  );
}

export default RoomCreatedScreen;
