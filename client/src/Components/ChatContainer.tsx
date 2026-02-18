import ChatBox from './ChatBox';
import { useGameStore } from '../store/gameStore';

function ChatContainer() {
  const username = useGameStore((state) => state.username);
  const room = useGameStore((state) => state.room);

  return (
    <div className="flex flex-col items-center border border-gray-300 rounded-lg mx-8 mt-8 py-8">
      <ChatBox username={username ?? ''} room={room ?? ''} />
    </div>
  );
}

export default ChatContainer;
