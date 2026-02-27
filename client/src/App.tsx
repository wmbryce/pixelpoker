import { useEffect, useState } from 'react';
import socket from './socket';
import { useGameStore } from './store/gameStore';
import GameContainer from './Components/GameContainer';
import ChatContainer from './Components/ChatContainer';
import WelcomeView from './Components/WelcomeView';
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
    socket.connect();
    socket.emit('joinRoom', { username: userId, room: roomId, clientId, smallBlind, bigBlind, aiCount });
  };

  useEffect(() => {
    socket.on('updateGame', (data) => {
      setGame(data);
    });

    socket.on('roomJoined', ({ playerIndex, game }) => {
      setMyPlayerIndex(playerIndex);
      setGame(game);
      setIsAttemptingRejoin(false);
    });

    socket.on('error', ({ message }) => {
      if (message === 'SESSION_NOT_FOUND' || message === 'ROOM_NOT_FOUND') {
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
      socket.connect();
      socket.emit('rejoinRoom', { clientId, room: urlRoom });
    }

    return () => {
      socket.off('updateGame');
      socket.off('roomJoined');
      socket.off('error');
    };
  }, [setGame, setMyPlayerIndex, setClientId, setUsername, setRoom]);

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

  return (
    <div className="flex flex-col justify-between w-full my-4 min-h-screen bg-vice-bg text-white">
      {username && room ? (
        <>
          <GameContainer />
          <ChatContainer />
        </>
      ) : (
        <WelcomeView setupRoom={setupRoom} />
      )}
    </div>
  );
}

export default App;
