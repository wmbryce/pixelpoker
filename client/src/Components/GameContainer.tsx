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
      <div className="flex justify-center items-center h-64 text-vice-muted tracking-widest animate-blink">
        ▸ WAITING FOR PLAYERS…
      </div>
    );
  }

  const advanceStage = () => {
    const action: GameAction = { type: 'advance', playerIndex: -1 };
    socket.emit('gameAction', action);
  };

  const stageLabel = game.stage < 4
    ? `▶ DEAL ${GAME_STAGES[game.stage]}`
    : GAME_STAGES[game.stage];

  return (
    <div className="flex flex-col justify-center my-4 text-center">
      <Table tableCards={game.tableCards} pot={game.pot} currentBet={game.currentBet} />

      <div>
        <button
          className="bg-vice-violet text-white px-8 py-3 my-2 font-bold tracking-widest uppercase text-sm btn-pixel hover:brightness-110 transition-all"
          onClick={advanceStage}
        >
          {stageLabel}
        </button>

        <div className="flex flex-row justify-around items-start my-4 flex-wrap gap-4 px-4">
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
