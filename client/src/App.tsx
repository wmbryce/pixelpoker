import { useEffect } from 'react';
import socket from './socket';
import { useGameStore } from './store/gameStore';
import GameContainer from './Components/GameContainer';
import ChatContainer from './Components/ChatContainer';
import WelcomeView from './Components/WelcomeView';

function App() {
  const { username, room, setUsername, setRoom, setGame, setMyPlayerIndex } = useGameStore();

  const setupRoom = (userId: string, roomId: string) => {
    setUsername(userId);
    setRoom(roomId);
    socket.connect();
    socket.emit('joinRoom', { username: userId, room: roomId });
  };

  useEffect(() => {
    socket.on('updateGame', (data) => {
      setGame(data);
    });

    socket.on('roomJoined', ({ playerIndex, game }) => {
      setMyPlayerIndex(playerIndex);
      setGame(game);
    });

    return () => {
      socket.off('updateGame');
      socket.off('roomJoined');
    };
  }, [setGame, setMyPlayerIndex]);

  return (
    <div className="flex flex-col justify-between w-full my-4">
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
