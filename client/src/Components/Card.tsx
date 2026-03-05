import type { CardType } from '@pixelpoker/shared';

interface Props {
  card: CardType | null;
  highlighted?: boolean; // true = winning card, false = non-winning, undefined = neutral
}

const SUITE_ICONS: Record<string, string> = {
  s: '♠',
  h: '♥',
  c: '♣',
  d: '♦',
};

function Card({ card, highlighted }: Props) {
  if (!card) {
    return (
      <div
        className="w-11 h-16 mx-0.5 sm:w-14 sm:h-20 sm:mx-1 border-2 border-vice-violet animate-card-deal"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, #7B2FBE 0, #7B2FBE 4px, #0D2137 4px, #0D2137 11px)',
          boxShadow: '3px 3px 0 rgba(0,0,0,0.70)',
        }}
      />
    );
  }

  const isRed = card.suite === 'h' || card.suite === 'd';
  const color = isRed ? '#FF2D78' : '#111827';
  const suit = SUITE_ICONS[card.suite];

  const dimmed = highlighted === false;
  const glowing = highlighted === true;

  return (
    <div
      className={`w-11 h-16 mx-0.5 sm:w-14 sm:h-20 sm:mx-1 border-2 relative flex flex-col animate-card-deal transition-all duration-300 ${
        dimmed  ? 'opacity-30 border-gray-900' :
        glowing ? 'border-vice-gold'           : 'border-gray-900'
      }`}
      style={{
        background: '#FFF8F0',
        boxShadow: glowing
          ? '3px 3px 0 rgba(0,0,0,0.70), 0 0 10px #FFB80080, 0 0 0 1px #FFB800'
          : '3px 3px 0 rgba(0,0,0,0.70)',
      }}
    >
      {/* Top-left pip */}
      <div
        className="absolute top-1 left-1 leading-none flex flex-col items-center"
        style={{ color, fontSize: 'clamp(7px, 2vw, 9px)', lineHeight: 1.3 }}
      >
        <span style={{ fontWeight: 700 }}>{card.label}</span>
        <span>{suit}</span>
      </div>

      {/* Centre suit */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color, fontSize: 'clamp(16px, 5vw, 26px)', lineHeight: 1 }}
      >
        {suit}
      </div>

      {/* Bottom-right pip (rotated) */}
      <div
        className="absolute bottom-1 right-1 leading-none flex flex-col items-center rotate-180"
        style={{ color, fontSize: 'clamp(7px, 2vw, 9px)', lineHeight: 1.3 }}
      >
        <span style={{ fontWeight: 700 }}>{card.label}</span>
        <span>{suit}</span>
      </div>
    </div>
  );
}

export default Card;
