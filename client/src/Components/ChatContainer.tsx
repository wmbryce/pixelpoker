import { useState } from 'react';
import ChatBox from './ChatBox';
import { useGameStore } from '../store/gameStore';

function ChatContainer() {
  const username = useGameStore((state) => state.username);
  const room = useGameStore((state) => state.room);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const toggle = () => {
    if (!isChatOpen) setHasUnread(false);
    setIsChatOpen((open) => !open);
  };

  return (
    <div className="relative">
      {/* Chat popup — slides up from the bar */}
      <div
        className={`absolute bottom-full left-0 right-0 mx-4 sm:mx-8 mb-1 bg-vice-surface border-2 border-vice-violet/40 z-40 ${isChatOpen ? '' : 'hidden'}`}
        style={{ boxShadow: '4px 4px 0 rgba(0,0,0,0.5)', maxHeight: '300px' }}
      >
        <div className="flex flex-col py-4 px-4">
          <ChatBox
            username={username ?? ''}
            room={room ?? ''}
            onNewMessage={() => {
              if (!isChatOpen) setHasUnread(true);
            }}
          />
        </div>
      </div>

      {/* Compact chat bar */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 w-full px-4 py-2 bg-vice-surface border-t border-vice-violet/40 hover:bg-vice-violet/10 transition-colors"
      >
        <span className="text-xs tracking-widest uppercase font-bold text-vice-gold">
          {isChatOpen ? '▾' : '▴'} CHAT
        </span>
        {hasUnread && !isChatOpen && (
          <span className="w-2 h-2 rounded-full bg-vice-pink shrink-0" />
        )}
        <span className="flex-1 text-right text-xs text-vice-muted/50 tracking-wider uppercase truncate">
          {!isChatOpen && 'click to expand'}
        </span>
      </button>
    </div>
  );
}

export default ChatContainer;
