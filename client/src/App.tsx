import { useEffect, useRef, useState } from 'react';
import socket from './socket';
import { CONFIG_ERROR } from './config';
import ConfigErrorScreen from './Components/ConfigErrorScreen';
import { useGameStore } from './store/gameStore';
import GameContainer from './Components/GameContainer';
import ChatContainer from './Components/ChatContainer';
import WelcomeView from './Components/WelcomeView';
import TrainingView from './Components/training/TrainingView';
import NotFoundScreen from './Components/NotFoundScreen';
import {
  getOrCreateClientId,
  getRoomFromUrl,
  setRoomInUrl,
  clearRoomFromUrl,
  getSavedPlayerName,
  savePlayerName,
} from './lib/clientSession';

function App() {
  const username = useGameStore((s) => s.username);
  const room = useGameStore((s) => s.room);
  const setUsername = useGameStore((s) => s.setUsername);
  const setRoom = useGameStore((s) => s.setRoom);
  const setGame = useGameStore((s) => s.setGame);
  const setMyPlayerIndex = useGameStore((s) => s.setMyPlayerIndex);
  const setClientId = useGameStore((s) => s.setClientId);

  // True while a silent auto-rejoin is in flight — prevents WelcomeView flashing
  const [isAttemptingRejoin, setIsAttemptingRejoin] = useState(false);
  const [showTraining, setShowTraining] = useState(false);

  // Which seat this tab owns, so a dropped socket can claim it back. Raw
  // WebSockets have no Socket.IO-style session, so reconnecting is only a fresh
  // transport — `rejoinRoom` is what actually restores the player.
  const sessionRef = useRef<{ clientId: string; room: string } | null>(null);
  const hasConnectedRef = useRef(false);

  const setupRoom = (
    userId: string,
    roomId: string,
    smallBlind?: number,
    bigBlind?: number,
    aiCount?: number,
  ) => {
    const clientId = getOrCreateClientId();
    setClientId(clientId);
    setUsername(userId);
    setRoom(roomId);
    savePlayerName(userId);
    setRoomInUrl(roomId);
    sessionRef.current = { clientId, room: roomId };
    socket.connect({ room: roomId, clientId });
    socket.emit('joinRoom', { username: userId, room: roomId, clientId, smallBlind, bigBlind, aiCount });
  };

  useEffect(() => {
    // Every open after the first is a reconnect: re-claim the seat. The first
    // open already has a queued joinRoom/rejoinRoom behind it.
    const onConnect = () => {
      if (!hasConnectedRef.current) {
        hasConnectedRef.current = true;
        return;
      }
      const session = sessionRef.current;
      if (session) socket.emit('rejoinRoom', session);
    };

    socket.on('connect', onConnect);

    socket.on('updateGame', (data) => {
      setGame(data);
    });

    socket.on('roomJoined', ({ playerIndex, game }) => {
      setMyPlayerIndex(playerIndex);
      setGame(game);
      setIsAttemptingRejoin(false);
    });

    socket.on('error', ({ message }) => {
      if (message === 'SESSION_NOT_FOUND' || message === 'ROOM_NOT_FOUND' || message === 'ROOM_FULL') {
        // The seat is gone, so the session must go with it: a stale
        // sessionRef/hasConnectedRef would make the next join re-emit
        // `rejoinRoom` for a room this tab had only just joined.
        sessionRef.current = null;
        hasConnectedRef.current = false;
        socket.disconnect();
        clearRoomFromUrl();
        setIsAttemptingRejoin(false);
        setUsername(null);
        setRoom(null);
      }
    });

    // Auto-rejoin attempt: all three prerequisites must be present
    const urlRoom = getRoomFromUrl();
    const savedName = getSavedPlayerName();
    const clientId = getOrCreateClientId();
    setClientId(clientId);

    if (urlRoom && savedName) {
      setIsAttemptingRejoin(true);
      setUsername(savedName);
      setRoom(urlRoom);
      sessionRef.current = { clientId, room: urlRoom };
      socket.connect({ room: urlRoom, clientId });
      socket.emit('rejoinRoom', { clientId, room: urlRoom });
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('updateGame');
      socket.off('roomJoined');
      socket.off('error');
    };
  }, [setGame, setMyPlayerIndex, setClientId, setUsername, setRoom]);

  if (CONFIG_ERROR) {
    return <ConfigErrorScreen message={CONFIG_ERROR} />;
  }

  if (window.location.pathname !== '/') {
    return <NotFoundScreen />;
  }

  if (isAttemptingRejoin) {
    return (
      <div className="flex flex-col justify-center items-center w-full min-h-screen bg-vice-bg text-white">
        <p className="text-vice-gold text-sm tracking-widest uppercase animate-pulse">
          RECONNECTING<span className="animate-blink ml-0.5">█</span>
        </p>
      </div>
    );
  }

  const leaveRoom = () => {
    socket.emit('leaveRoom');
    sessionRef.current = null;
    hasConnectedRef.current = false;
    socket.disconnect();
    clearRoomFromUrl();
    setUsername(null);
    setRoom(null);
  };

  if (showTraining) {
    return (
      <div className="flex flex-col w-full min-h-screen bg-vice-bg text-white">
        <TrainingView onBack={() => setShowTraining(false)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-vice-bg text-white">
      {username && room ? (
        <div className="flex flex-col min-h-screen">
          <GameContainer onLeave={leaveRoom} />
          <ChatContainer />
        </div>
      ) : (
        <WelcomeView setupRoom={setupRoom} onTraining={() => setShowTraining(true)} />
      )}
    </div>
  );
}

export default App;
