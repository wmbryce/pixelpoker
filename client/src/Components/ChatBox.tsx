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
      <h2 className="text-base font-semibold mb-3">
        {username} <span className="text-xs text-gray-500 font-normal">in {room}</span>
      </h2>

      <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-4 pr-1">
        {messages.map((msg, i) => {
          const isMine = msg.username === username;
          return (
            <div
              key={i}
              className={`flex flex-col border border-gray-300 rounded px-4 py-2 max-w-[70%] ${
                isMine ? 'self-end items-end' : 'self-start items-start'
              }`}
            >
              <p className="text-sm text-gray-900">{msg.text}</p>
              <p className="text-xs text-gray-400">{msg.username}</p>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Type a message…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') sendData();
          }}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 transition-colors"
          onClick={sendData}
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatBox;
