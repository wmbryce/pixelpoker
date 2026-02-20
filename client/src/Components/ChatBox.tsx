import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import type { ChatMessage } from '@pixelpoker/shared';

interface Props {
  username: string;
  room: string;
}

function ChatBox({ username, room }: Props) {
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMessage = (data: ChatMessage) => {
      setMessages((prev) => [...prev, data]);
    };
    socket.on('message', handleMessage);
    return () => {
      socket.off('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendData = () => {
    if (text.trim() !== '') {
      socket.emit('chat', text.trim());
      setText('');
    }
  };

  return (
    <div className="w-11/12">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-vice-violet/30">
        <span className="text-vice-cyan text-xs tracking-widest uppercase font-bold">{username}</span>
        <span className="text-vice-violet">│</span>
        <span className="text-vice-muted text-xs tracking-widest uppercase">{room}</span>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto mb-4 pr-1">
        {messages.map((msg, i) => {
          const isMine = msg.username === username;
          return (
            <div
              key={i}
              className={`flex flex-col px-3 py-2 max-w-[72%] border ${
                isMine
                  ? 'self-end items-end bg-vice-pink/15 border-vice-pink/40'
                  : 'self-start items-start bg-vice-bg border-vice-cyan/20'
              }`}
            >
              <p className="text-sm text-white">{msg.text}</p>
              <p className="text-xs text-vice-muted/70 mt-0.5">{msg.username}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center bg-vice-bg border border-vice-muted/50 focus-within:border-vice-cyan transition-colors">
          <span className="pl-2 text-vice-cyan text-sm select-none">▶</span>
          <input
            className="flex-1 bg-transparent px-2 py-2 text-sm text-white placeholder-vice-muted/50 focus:outline-none uppercase tracking-wider"
            placeholder="TYPE MESSAGE…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendData();
            }}
          />
        </div>
        <button
          className="bg-vice-pink text-white px-5 py-2 text-xs font-bold tracking-widest uppercase btn-pixel hover:brightness-110"
          onClick={sendData}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
