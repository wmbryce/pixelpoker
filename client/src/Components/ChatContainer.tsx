import { useState } from 'react';
import ChatBox from './ChatBox';
import { useGameStore } from '../store/gameStore';

function ChatContainer() {
  const username = useGameStore((state) => state.username);
  const room = useGameStore((state) => state.room);

  const [isChatOpen, setIsChatOpen] = useState(() => window.innerWidth >= 640);
  const [hasUnread, setHasUnread] = useState(false);

  const toggle = () => {
    if (!isChatOpen) setHasUnread(false);
    setIsChatOpen((open) => !open);
  };

  return (
    <div
      className="bg-vice-surface border-2 border-vice-violet/40 mx-4 sm:mx-8 mt-8"
      style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)' }}
    >
      {/* Toggle strip */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-xs tracking-widest uppercase font-bold text-vice-gold border-b border-vice-violet/40 hover:bg-vice-violet/10 transition-colors"
      >
        <span>{isChatOpen ? '▴' : '▾'} CHAT</span>
        {hasUnread && !isChatOpen && (
          <span className="w-2 h-2 rounded-full bg-vice-pink ml-1 shrink-0" />
        )}
      </button>

      {/* Always mounted so the socket listener stays active; hidden via CSS when closed */}
      <div className={`flex flex-col items-center py-6 ${isChatOpen ? '' : 'hidden'}`}>
        <ChatBox
          username={username ?? ''}
          room={room ?? ''}
          onNewMessage={() => {
            if (!isChatOpen) setHasUnread(true);
          }}
        />
      </div>
    </div>
  );
}

export default ChatContainer;
