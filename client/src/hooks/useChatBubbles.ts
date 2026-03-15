import { useState, useEffect, useCallback, useRef } from 'react';
import socket from '../socket';
import type { ChatMessage } from '@pixelpoker/shared';

const BUBBLE_DURATION_MS = 4000;

/** Maps player name → latest chat bubble text. Expires after BUBBLE_DURATION_MS. */
export function useChatBubbles() {
  const [bubbles, setBubbles] = useState<Map<string, string>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleMessage = useCallback((data: ChatMessage) => {
    if (data.username === 'System') return;

    setBubbles((prev) => {
      const next = new Map(prev);
      next.set(data.username, data.text);
      return next;
    });

    // Clear any existing timer for this player
    const existing = timersRef.current.get(data.username);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      setBubbles((prev) => {
        const next = new Map(prev);
        next.delete(data.username);
        return next;
      });
      timersRef.current.delete(data.username);
    }, BUBBLE_DURATION_MS);

    timersRef.current.set(data.username, timer);
  }, []);

  useEffect(() => {
    socket.on('message', handleMessage);
    return () => {
      socket.off('message', handleMessage);
      // Clean up all timers
      for (const timer of timersRef.current.values()) clearTimeout(timer);
    };
  }, [handleMessage]);

  return bubbles;
}
