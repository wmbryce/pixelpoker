import { useState, useEffect } from 'react';
import Table from './Table';
import Player from './Player';
import { useGameStore } from '../store/gameStore';
import { GAME_STAGES } from '@pixelpoker/shared';
import socket from '../socket';
import type { GameAction } from '@pixelpoker/shared';

function GameContainer() {
  const game = useGameStore((state) => state.game);
  const myPlayerIndex = useGameStore((state) => state.myPlayerIndex);

  const [pendingSmallBlind, setPendingSmallBlind] = useState(10);
  const [pendingBigBlind, setPendingBigBlind] = useState(20);

  // Keep pending inputs in sync when another player changes blinds
  useEffect(() => {
    if (game) {
      setPendingSmallBlind(game.smallBlind);
      setPendingBigBlind(game.bigBlind);
    }
  }, [game?.smallBlind, game?.bigBlind]);

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

  const applyBlinds = () => {
    if (pendingSmallBlind <= 0 || pendingBigBlind <= pendingSmallBlind) return;
    socket.emit('changeBlinds', { smallBlind: pendingSmallBlind, bigBlind: pendingBigBlind });
  };

  const stageLabel = game.stage < 4
    ? `▶ DEAL ${GAME_STAGES[game.stage]}`
    : GAME_STAGES[game.stage];

  return (
    <div className="flex flex-col justify-center my-4 text-center">
      <Table
        tableCards={game.tableCards}
        pot={game.pot}
        currentBet={game.currentBet}
        winnerCards={game.winnerCards}
        smallBlind={game.smallBlind}
        bigBlind={game.bigBlind}
      />

      <div>
        {/* Blind controls — only visible between hands */}
        {game.stage === 0 && (
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-vice-muted/60 text-xs tracking-widest uppercase">Blinds</span>
            <div className="flex items-center gap-1">
              <span className="text-vice-muted/50 text-xs">SB $</span>
              <input
                type="number"
                min={1}
                value={pendingSmallBlind}
                onChange={(e) => setPendingSmallBlind(Number.parseInt(e.target.value, 10))}
                className="w-16 bg-vice-bg border border-vice-muted/30 text-center text-sm focus:outline-none focus:border-vice-gold px-1 py-1 transition-colors"
              />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-vice-muted/50 text-xs">BB $</span>
              <input
                type="number"
                min={2}
                value={pendingBigBlind}
                onChange={(e) => setPendingBigBlind(Number.parseInt(e.target.value, 10))}
                className="w-16 bg-vice-bg border border-vice-muted/30 text-center text-sm focus:outline-none focus:border-vice-gold px-1 py-1 transition-colors"
              />
            </div>
            <button
              onClick={applyBlinds}
              className="bg-vice-violet text-white px-3 py-1 text-xs font-bold tracking-widest uppercase btn-pixel hover:brightness-110"
            >
              SET
            </button>
          </div>
        )}

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
              winnerHandName={game.winnerHandName}
              winnerCards={game.winnerCards}
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
