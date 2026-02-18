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
    if (userId.trim().length === 0) newErrors.push('Username is required.');
    if (roomId.trim().length === 0) newErrors.push('Room name is required.');
    setErrors(newErrors);
    if (newErrors.length === 0) setupRoom(userId.trim(), roomId.trim());
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  return (
    <div className="flex flex-col gap-4 justify-center items-center mx-auto mt-44 p-8 w-80 border border-gray-300 rounded-2xl shadow-md">
      <h1 className="text-2xl font-bold">Pixel Poker</h1>
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="Username"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        onKeyDown={handleKey}
      />
      <input
        className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
        placeholder="Room name"
        value={roomId}
        onChange={(e) => setRoomId(e.target.value)}
        onKeyDown={handleKey}
      />
      {errors.map((err, i) => (
        <p key={i} className="text-red-500 text-sm self-start">
          {err}
        </p>
      ))}
      <button
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition-colors"
        onClick={handleJoin}
      >
        Join
      </button>
    </div>
  );
}

export default WelcomeView;
