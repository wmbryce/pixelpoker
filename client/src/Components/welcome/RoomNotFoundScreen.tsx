interface Props {
  roomCode: string;
  onTryAgain: () => void;
  onCreate: () => void;
}

function RoomNotFoundScreen({ roomCode, onTryAgain, onCreate }: Props) {
  return (
    <div className="flex flex-col gap-4 w-full items-center">
      <div className="w-full text-center flex flex-col gap-1">
        <p className="text-vice-pink text-xs tracking-widest uppercase">▸ Room not found</p>
        <p className="text-vice-muted/60 text-xs tracking-wider">
          No room with code <span className="text-white font-bold">{roomCode}</span> exists.
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full">
        <button
          onClick={onTryAgain}
          className="w-full bg-vice-cyan text-vice-bg py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
        >
          TRY AGAIN
        </button>
        <button
          onClick={onCreate}
          className="w-full bg-vice-pink text-white py-3 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110"
        >
          CREATE ROOM
        </button>
      </div>
    </div>
  );
}

export default RoomNotFoundScreen;
