import Table from './Table';
import Player from './Player';
import { useGameStore } from '../store/gameStore';
import { GAME_STAGES } from '@pixelpoker/shared';
import socket from '../socket';
import type { GameAction } from '@pixelpoker/shared';

function GameContainer() {
  const game = useGameStore((state) => state.game);
  const myPlayerIndex = useGameStore((state) => state.myPlayerIndex);

  if (!game) {
    return (
      <div className="flex justify-center items-center h-64 text-gray-500 text-lg">
        Waiting for game to start…
      </div>
    );
  }

  const advanceStage = () => {
    const action: GameAction = { type: 'advance', playerIndex: -1 };
    socket.emit('gameAction', action);
  };

  return (
    <div className="flex flex-col justify-center my-4 text-center">
      <Table tableCards={game.tableCards} pot={game.pot} currentBet={game.currentBet} />
      <div>
        <button
          className="bg-green-600 text-white px-5 py-2 rounded my-2 hover:bg-green-700 transition-colors"
          onClick={advanceStage}
        >
          {game.stage < 4 ? `Deal ${GAME_STAGES[game.stage]}` : GAME_STAGES[game.stage]}
        </button>

        <div className="flex flex-row justify-around items-start my-4 flex-wrap gap-4">
          {game.players.map((player, index) => (
            <Player
              key={player.id}
              player={player}
              index={index}
              dealer={game.dealer}
              winner={game.winner}
              actionOn={game.actionOn}
              currentBet={game.currentBet}
              numPlayers={game.players.length}
              isMe={myPlayerIndex === index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default GameContainer;
