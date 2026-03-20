import Card from '../Card';
import TrainingHud from './TrainingHud';
import TrainingActionControls from './TrainingActionControls';
import type { TrainingGameState, OpponentState } from '@pixelpoker/shared/src/trainingTypes';

interface TrainingTableProps {
  gameState: TrainingGameState;
  lessonTitle: string;
  handNumber: number;
  totalHands: number;
  handResults: Array<'correct' | 'wrong' | 'pending'>;
  onAction: (action: { type: 'fold' | 'check' | 'call' | 'raise'; bet?: number }) => void;
}

const STAGE_LABELS = ['Pre-flop', 'Flop', 'Turn', 'River'];

function OpponentCard({ opp }: { opp: OpponentState }) {
  return (
    <div className="text-center">
      <div className="w-9 h-9 border-2 border-vice-surface bg-vice-surface flex items-center justify-center mx-auto">
        <span className="font-press text-[8px] text-vice-muted">
          {opp.persona.slice(0, 2).toUpperCase()}
        </span>
      </div>
      <div className="text-[9px] text-vice-muted mt-1 tracking-wider uppercase">
        {opp.persona} · ${opp.stack}
      </div>
      {opp.lastAction && (
        <div className={`font-press text-[7px] mt-0.5 ${
          opp.lastAction === 'FOLD' ? 'text-vice-pink'
          : opp.lastAction === 'CHECK' ? 'text-vice-muted'
          : opp.lastAction === 'CALL' ? 'text-vice-cyan'
          : 'text-vice-gold'
        }`}>
          {opp.lastAction}
        </div>
      )}
    </div>
  );
}

export default function TrainingTable({
  gameState, lessonTitle, handNumber, totalHands, handResults, onAction,
}: TrainingTableProps) {
  const { playerCards, communityCards, pot, opponents, playerPosition } = gameState;

  return (
    <div className="min-h-screen flex flex-col items-center pt-8 px-4">
      <div className="w-full max-w-lg">
        <TrainingHud
          lessonTitle={lessonTitle}
          handNumber={handNumber}
          totalHands={totalHands}
          results={handResults}
        />

        {/* Table felt */}
        <div className="table-felt border-2 border-vice-gold/30 rounded-full p-6 text-center table-grid"
             style={{ boxShadow: '0 0 24px #FFB80015, inset 0 0 40px rgba(0,0,0,0.4)' }}>
          <div className="font-press text-[8px] text-vice-muted/70 tracking-widest uppercase">
            {STAGE_LABELS[gameState.stage] ?? 'Pre-flop'}
          </div>

          {/* Community cards */}
          <div className="flex justify-center gap-1.5 mt-2 min-h-[56px]">
            {communityCards.map((card, i) => (
              <Card key={i} card={card} />
            ))}
          </div>

          {/* Pot */}
          <div className="mt-3">
            <div className="font-press text-[7px] text-vice-muted/70 tracking-widest uppercase">Pot</div>
            <div className="font-press text-vice-gold text-lg tracking-wider"
                 style={{ textShadow: '0 0 10px #FFB80080' }}>
              ${pot}
            </div>
          </div>

          {/* Opponents */}
          <div className="flex justify-around mt-4">
            {opponents.filter(o => o.isActive).map((opp, i) => (
              <OpponentCard key={i} opp={opp} />
            ))}
          </div>
        </div>

        {/* Player area */}
        <div className="mt-4 border-t border-vice-violet/30 pt-4">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-vice-muted/70 text-[9px] tracking-wider uppercase">You</span>
              <span className="font-press text-[7px] bg-vice-violet/80 text-white px-2 py-0.5 tracking-wider uppercase">
                {playerPosition}
              </span>
              <span className="text-vice-gold font-press text-xs tracking-wider">
                ${gameState.playerStack}
              </span>
            </div>
            <div className="flex gap-1.5">
              {playerCards.map((card, i) => (
                <Card key={i} card={card} />
              ))}
            </div>
          </div>

          <TrainingActionControls
            currentBet={gameState.currentBet}
            playerLastBet={gameState.playerLastBet}
            playerStack={gameState.playerStack}
            pot={gameState.pot}
            bigBlind={gameState.bigBlind}
            lastRaiseSize={gameState.lastRaiseSize}
            onAction={onAction}
          />
        </div>
      </div>
    </div>
  );
}
