import ChatBox from './ChatBox';
import { useGameStore } from '../store/gameStore';

function ChatContainer() {
  const username = useGameStore((state) => state.username);
  const room = useGameStore((state) => state.room);

  return (
    <div
      className="flex flex-col items-center bg-vice-surface border-2 border-vice-violet/40 mx-8 mt-8 py-6"
      style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}
    >
      <ChatBox username={username ?? ''} room={room ?? ''} />
    </div>
  );
}

export default ChatContainer;
