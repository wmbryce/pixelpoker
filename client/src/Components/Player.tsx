import { useState } from 'react';
import Hand from './Hand';
import socket from '../socket';
import type { PlayerType } from '@pixelpoker/shared';
import type { GameAction } from '@pixelpoker/shared';

interface Props {
  player: PlayerType;
  index: number;
  dealer: number;
  winner: number[];
  actionOn: number;
  currentBet: number;
  numPlayers: number;
  isMe: boolean;
}

function seatLabel(index: number, dealer: number, numPlayers: number): string {
  if (index === dealer) return 'Dealer';
  if (index === (dealer + 1) % numPlayers) return 'Small Blind';
  if (index === (dealer + 2) % numPlayers) return 'Big Blind';
  return '';
}

function Player({
  player,
  index,
  dealer,
  winner,
  actionOn,
  currentBet,
  numPlayers,
  isMe,
}: Props) {
  const [bet, setBet] = useState(20);

  const isMyTurn = isMe && actionOn === index && player.isActive;

  const sendAction = (type: GameAction['type']) => {
    const action: GameAction = { type, playerIndex: index, bet };
    socket.emit('gameAction', action);
  };

  const label = seatLabel(index, dealer, numPlayers);
  const isWinner = winner.includes(index);

  return (
    <div
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 min-w-[160px] ${
        isMyTurn ? 'border-yellow-400 bg-yellow-50' : 'border-gray-200 bg-white'
      } ${!player.isActive ? 'opacity-50' : ''}`}
    >
      <h2 className="text-base font-bold">
        {player.name}
        {isMe && <span className="ml-1 text-xs text-blue-500">(you)</span>}
      </h2>
      {label && <p className="text-xs text-gray-500">{label}</p>}
      <p className="text-sm font-semibold">${player.stack}</p>

      <Hand hand={player.cards} active={player.isActive} />

      {isWinner && (
        <span className="text-yellow-500 font-bold text-sm">Winner!</span>
      )}

      {isMe && (
        <div className="flex flex-col items-center gap-2 mt-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">Bet:</label>
            <input
              type="number"
              min={currentBet}
              max={player.stack}
              value={bet}
              disabled={!isMyTurn}
              onChange={(e) => setBet(Number.parseInt(e.target.value, 10))}
              className="w-20 border border-gray-300 rounded px-2 py-1 text-sm disabled:opacity-40"
            />
          </div>
          <button
            onClick={() => sendAction('raise')}
            disabled={!isMyTurn}
            className="w-28 bg-blue-600 text-white text-sm py-1 rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Raise {bet}
          </button>
          <button
            onClick={() => sendAction('call')}
            disabled={!isMyTurn}
            className="w-28 bg-gray-600 text-white text-sm py-1 rounded hover:bg-gray-700 disabled:opacity-40 transition-colors"
          >
            Check / Call
          </button>
          <button
            onClick={() => sendAction('fold')}
            disabled={!isMyTurn}
            className="w-28 bg-red-600 text-white text-sm py-1 rounded hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            Fold
          </button>
        </div>
      )}
    </div>
  );
}

export default Player;
