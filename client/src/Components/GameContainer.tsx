import { useState, useEffect } from 'react';
import Table from './Table';
import Player from './Player';
import { useGameStore } from '../store/gameStore';
import { useSoundStore } from '../store/soundStore';
import { useGameSounds } from '../hooks/useGameSounds';
import { useGameAnimations } from '../hooks/useGameAnimations';
import { useChatBubbles } from '../hooks/useChatBubbles';
import socket from '../socket';
import type { GameAction } from '@pixelpoker/shared';

/**
 * Returns seat positions around the table for N players.
 * Index 0 is always bottom-center (the local player).
 * Positions are [left%, top%] within the oval container.
 */
function getSeatPositions(count: number): [number, number][] {
  // Hand-tuned positions for each player count (max 6)
  const layouts: Record<number, [number, number][]> = {
    1: [[50, 80]],
    2: [[50, 80], [50, 0]],
    3: [[50, 80], [8, 0], [92, 0]],
    4: [[50, 80], [4, 40], [50, 0], [96, 40]],
    5: [[50, 80], [4, 46], [20, 0], [80, 0], [96, 46]],
    6: [[50, 80], [4, 46], [20, 0], [50, 0], [80, 0], [96, 46]],
  };
  return layouts[Math.min(count, 6)] ?? layouts[6];
}

function GameContainer({ onLeave }: { onLeave: () => void }) {
  const game = useGameStore((state) => state.game);
  const myPlayerIndex = useGameStore((state) => state.myPlayerIndex);
  const { isMuted, toggleMute } = useSoundStore();

  useGameSounds(game, myPlayerIndex);
  const animations = useGameAnimations(game);
  const chatBubbles = useChatBubbles();

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

  const BETTING_STAGE_LABELS: Record<number, string> = {
    1: 'PRE-FLOP',
    2: 'FLOP',
    3: 'TURN',
    4: 'RIVER',
  };

  // Build seat assignments: rotate so myPlayerIndex is always seat 0 (bottom center)
  const activePlayers = game.players
    .map((p, i) => ({ player: p, originalIndex: i }))
    .filter(({ player }) => !player.hasLeft);

  const myIdx = myPlayerIndex ?? 0;
  // Sort so that the current player is first, then others in clockwise order
  const sortedPlayers = [...activePlayers].sort((a, b) => {
    const aRel = (a.originalIndex - myIdx + game.players.length) % game.players.length;
    const bRel = (b.originalIndex - myIdx + game.players.length) % game.players.length;
    return aRel - bRel;
  });

  const seatPositions = getSeatPositions(sortedPlayers.length);

  return (
    <div className="flex flex-col text-center flex-1 pt-6">
      {/* Header */}
      <div className="flex justify-between px-4 mb-2">
        <button
          onClick={onLeave}
          className="text-vice-muted text-xs tracking-widest uppercase hover:text-vice-pink transition-colors"
        >
          ← LEAVE GAME
        </button>
        <button
          onClick={toggleMute}
          className="text-vice-muted text-sm hover:text-vice-gold transition-colors"
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* Table area with players positioned around it */}
      <div className="relative mx-auto w-full max-w-[900px] px-2 sm:px-4" style={{ minHeight: 'max(480px, 60vh)' }}>
        {/* Players around the table */}
        {sortedPlayers.map(({ player, originalIndex }, seatIdx) => {
          const [leftPct, topPct] = seatPositions[seatIdx];
          const isBottom = seatIdx === 0;
          const bubble = chatBubbles.get(player.name);

          return (
            <div
              key={player.id}
              className="absolute -translate-x-1/2"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                zIndex: isBottom ? 20 : 10,
              }}
            >
              {/* Chat bubble */}
              {bubble && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 animate-chat-bubble pointer-events-none">
                  <div className="bg-vice-surface border border-vice-cyan/40 px-3 py-1.5 text-xs text-white whitespace-nowrap max-w-[200px] truncate"
                    style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.5)' }}
                  >
                    {bubble}
                  </div>
                  {/* Arrow */}
                  <div className="w-0 h-0 mx-auto border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent border-t-vice-cyan/40" />
                </div>
              )}
              <Player
                player={player}
                index={originalIndex}
                dealer={game.dealer}
                winner={game.winner}
                winnerHandName={game.winnerHandName}
                winnerCards={game.winnerCards}
                actionOn={game.actionOn}
                currentBet={game.currentBet}
                lastRaiseSize={game.lastRaiseSize}
                numPlayers={game.players.length}
                isMe={myPlayerIndex === originalIndex}
                timerDeadline={game.timerDeadline ?? null}
                bigBlind={game.bigBlind}
                isFolding={animations.foldingPlayers.has(originalIndex)}
                isRevealing={animations.revealingPlayers.has(originalIndex)}
                compact={!isBottom}
              />
            </div>
          );
        })}

        {/* Table (centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-[640px]">
          <Table
            tableCards={game.tableCards}
            pot={game.pot}
            currentBet={game.currentBet}
            winnerCards={game.winnerCards}
            smallBlind={game.smallBlind}
            bigBlind={game.bigBlind}
            players={game.players}
            stage={game.stage}
            winner={game.winner}
            newCommunityCards={animations.newCommunityCards}
            communityStaggerMs={animations.communityStaggerMs}
            stageLabel={game.stage >= 1 && game.stage <= 4 ? BETTING_STAGE_LABELS[game.stage] : undefined}
            onDeal={game.stage === 0 ? advanceStage : undefined}
            blindControls={game.stage === 0 ? (
              <div className="flex items-center justify-center gap-3">
                <span className="text-vice-muted/60 text-xs tracking-widest uppercase">Blinds</span>
                <div className="flex items-center gap-1">
                  <span className="text-vice-muted/50 text-xs">SB $</span>
                  <input
                    type="number"
                    min={1}
                    value={pendingSmallBlind}
                    onChange={(e) => setPendingSmallBlind(Number.parseInt(e.target.value, 10))}
                    className="w-14 sm:w-16 bg-vice-bg border border-vice-muted/30 text-center text-base focus:outline-none focus:border-vice-gold px-1 py-1 transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-vice-muted/50 text-xs">BB $</span>
                  <input
                    type="number"
                    min={2}
                    value={pendingBigBlind}
                    onChange={(e) => setPendingBigBlind(Number.parseInt(e.target.value, 10))}
                    className="w-14 sm:w-16 bg-vice-bg border border-vice-muted/30 text-center text-base focus:outline-none focus:border-vice-gold px-1 py-1 transition-colors"
                  />
                </div>
                <button
                  onClick={applyBlinds}
                  className="bg-vice-violet text-white px-3 py-1 text-xs font-bold tracking-widest uppercase btn-pixel hover:brightness-110"
                >
                  SET
                </button>
              </div>
            ) : undefined}
          />
        </div>
      </div>

    </div>
  );
}

export default GameContainer;
