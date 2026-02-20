import type { CardType } from '@pixelpoker/shared';

interface Props {
  card: CardType | null;
}

const SUITE_ICONS: Record<string, string> = {
  s: '♠',
  h: '♥',
  c: '♣',
  d: '♦',
};

function Card({ card }: Props) {
  if (!card) {
    return (
      <div
        className="w-14 h-20 mx-1 border-2 border-vice-violet animate-card-deal"
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

  return (
    <div
      className="w-14 h-20 mx-1 bg-gray-50 border-2 border-gray-900 relative flex flex-col animate-card-deal"
      style={{ boxShadow: '3px 3px 0 rgba(0,0,0,0.70)' }}
    >
      {/* Top-left pip */}
      <div
        className="absolute top-1 left-1 leading-none flex flex-col items-center"
        style={{ color, fontSize: '9px', lineHeight: 1.3 }}
      >
        <span style={{ fontWeight: 700 }}>{card.label}</span>
        <span>{suit}</span>
      </div>

      {/* Centre suit */}
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color, fontSize: '26px', lineHeight: 1 }}
      >
        {suit}
      </div>

      {/* Bottom-right pip (rotated) */}
      <div
        className="absolute bottom-1 right-1 leading-none flex flex-col items-center rotate-180"
        style={{ color, fontSize: '9px', lineHeight: 1.3 }}
      >
        <span style={{ fontWeight: 700 }}>{card.label}</span>
        <span>{suit}</span>
      </div>
    </div>
  );
}

export default Card;
