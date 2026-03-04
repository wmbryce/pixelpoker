import { describe, it, expect } from 'bun:test';
import { initializeGame, createPlayer, advanceGameStage, awardPotDirectly } from '../controllers/gameplay';
import { raise, call, nextPlayer } from '../controllers/actions';
import type { Poker } from '../controllers/types';
import type { CardType } from '@pixelpoker/shared';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const makeGame = (numPlayers = 2, smallBlind = 10, bigBlind = 20) => {
  const game = initializeGame(smallBlind, bigBlind);
  for (let i = 0; i < numPlayers; i++) {
    game.players.push(createPlayer(`id-${i}`, `Player${i}`));
  }
  return game;
};

// Mirrors deck.ts: ten uses 'T' in pokersolver value, '10' as display label.
const card = (label: string, suite: string): CardType => ({
  label,
  suite,
  value: (label === '10' ? 'T' : label) + suite,
});

/** Sum of all player stacks + pot. Should be invariant through any hand. */
const totalChips = (game: Poker) =>
  game.players.reduce((sum, p) => sum + p.stack, 0) + game.pot;

// ──────────────────────────────────────────────────────────────────────────────
// initializeGame
// ──────────────────────────────────────────────────────────────────────────────

describe('initializeGame', () => {
  it('returns an empty game with a full deck', () => {
    const game = initializeGame();
    expect(game.stage).toBe(0);
    expect(game.pot).toBe(0);
    expect(game.players).toHaveLength(0);
    expect(game.deck).toHaveLength(52);
    expect(game.tableCards).toHaveLength(0);
    expect(game.winner).toHaveLength(0);
  });

  it('uses default blind values of 10 / 20', () => {
    const game = initializeGame();
    expect(game.smallBlind).toBe(10);
    expect(game.bigBlind).toBe(20);
  });

  it('accepts custom blind values', () => {
    const game = initializeGame(25, 50);
    expect(game.smallBlind).toBe(25);
    expect(game.bigBlind).toBe(50);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// createPlayer
// ──────────────────────────────────────────────────────────────────────────────

describe('createPlayer', () => {
  it('creates a player with 1000 chips and no cards', () => {
    const p = createPlayer('abc', 'Alice');
    expect(p.id).toBe('abc');
    expect(p.name).toBe('Alice');
    expect(p.stack).toBe(1000);
    expect(p.cards).toHaveLength(0);
    expect(p.isActive).toBe(true);
    expect(p.checked).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// advanceGameStage — dealing
// ──────────────────────────────────────────────────────────────────────────────

describe('advanceGameStage (pre-flop)', () => {
  it('deals 2 cards to each player on stage 0 → 1', () => {
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.stage).toBe(1);
    for (const player of next.players) {
      expect(player.cards).toHaveLength(2);
    }
    // 52 - 6 dealt = 46 remaining
    expect(next.deck).toHaveLength(46);
  });
});

describe('advanceGameStage (flop)', () => {
  it('deals 3 community cards on stage 1 → 2', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    const next = advanceGameStage(game);
    expect(next.stage).toBe(2);
    expect(next.tableCards).toHaveLength(3);
  });
});

describe('advanceGameStage (turn)', () => {
  it('deals 1 community card on stage 2 → 3', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    const next = advanceGameStage(game);
    expect(next.stage).toBe(3);
    expect(next.tableCards).toHaveLength(4);
  });
});

describe('advanceGameStage (river)', () => {
  it('deals 1 community card on stage 3 → 4', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    game = advanceGameStage(game); // turn
    const next = advanceGameStage(game);
    expect(next.stage).toBe(4);
    expect(next.tableCards).toHaveLength(5);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Blind posting
// ──────────────────────────────────────────────────────────────────────────────

describe('postBlinds (via pre-flop deal)', () => {
  it('deducts small blind from SB player and big blind from BB player', () => {
    // dealer=0, SB=1, BB=2, UTG=0 (wraps)
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.players[1].stack).toBe(990); // SB paid 10
    expect(next.players[2].stack).toBe(980); // BB paid 20
    expect(next.players[0].stack).toBe(1000); // UTG untouched
  });

  it('sets lastBet on SB and BB to the amount they posted', () => {
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.players[1].lastBet).toBe(10);
    expect(next.players[2].lastBet).toBe(20);
  });

  it('adds both blinds to the pot', () => {
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.pot).toBe(30); // 10 + 20
  });

  it('sets currentBet to the big blind', () => {
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.currentBet).toBe(20);
  });

  it('sets actionOn to UTG (player after BB)', () => {
    // dealer=0, SB=1, BB=2 → UTG = (0+3)%3 = 0
    const game = makeGame(3);
    const next = advanceGameStage(game);
    expect(next.actionOn).toBe(0);
  });

  it('uses custom blind values from the game state', () => {
    const game = makeGame(2, 25, 50); // dealer=0, SB=1, BB=0 (wraps)
    const next = advanceGameStage(game);
    expect(next.currentBet).toBe(50);
    expect(next.pot).toBe(75); // 25 + 50
  });

  it('does not post blinds on subsequent stage advances', () => {
    let game = makeGame(2);
    game = advanceGameStage(game); // pre-flop → blinds posted, pot=30
    const potAfterPreflop = game.pot;
    const next = advanceGameStage(game); // flop → no new blinds
    expect(next.pot).toBe(potAfterPreflop);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Showdown — winner determination
// ──────────────────────────────────────────────────────────────────────────────

describe('advanceGameStage (showdown)', () => {
  it('determines a winner and distributes the pot', () => {
    let game = makeGame(2);
    game.players[0].stack -= 100;
    game.players[1].stack -= 100;
    game.pot = 200;
    const initialTotal = totalChips(game);
    game = advanceGameStage(game); // pre-flop
    game = advanceGameStage(game); // flop
    game = advanceGameStage(game); // turn
    game = advanceGameStage(game); // river
    const next = advanceGameStage(game); // showdown
    expect(next.stage).toBe(5);
    expect(next.winner.length).toBeGreaterThan(0);
    expect(totalChips(next)).toBe(initialTotal);
  });

  it('populates winnerHandName with a non-empty string', () => {
    // Manually place known hands and advance from stage 4
    const game = makeGame(2);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const next = advanceGameStage(game);
    expect(next.winnerHandName).toBeTruthy();
    expect(typeof next.winnerHandName).toBe('string');
  });

  it('identifies four aces as the winning hand name', () => {
    const game = makeGame(2);
    game.stage = 4;
    // Player 0: Ah + Ac; table: As Ad → four aces
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const next = advanceGameStage(game);
    expect(next.winner).toContain(0);
    expect(next.winner).not.toContain(1);
    expect(next.winnerHandName).toBe('Four of a Kind');
  });

  it('identifies a royal flush correctly', () => {
    const game = makeGame(2);
    game.stage = 4;
    // Player 0: Ah Kh; table: Qh Jh 10h → royal flush in hearts
    // Player 1: 2c 3d → only a pair of 2s (with 2d on table)
    game.players[0].cards = [card('A', 'h'), card('K', 'h')];
    game.players[1].cards = [card('2', 'c'), card('3', 'd')];
    game.tableCards = [
      card('Q', 'h'), card('J', 'h'), card('10', 'h'), card('2', 'd'), card('4', 's'),
    ];
    const next = advanceGameStage(game);
    expect(next.winner).toContain(0);
    expect(next.winner).not.toContain(1);
    expect(next.winnerHandName).toBe('Royal Flush');
  });

  it('populates winnerCards with exactly 5 cards', () => {
    const game = makeGame(2);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const next = advanceGameStage(game);
    expect(next.winnerCards).toHaveLength(5);
  });

  it('winnerCards are all drawn from the dealt cards — no phantom cards', () => {
    const game = makeGame(2);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const allDealtValues = new Set([
      ...game.tableCards.map((c) => c.value),
      ...game.players.flatMap((p) => p.cards.map((c) => c.value)),
    ]);
    const next = advanceGameStage(game);
    for (const cardValue of next.winnerCards) {
      expect(allDealtValues.has(cardValue)).toBe(true);
    }
  });

  it('clears winnerHandName and winnerCards after reset', () => {
    const game = makeGame(2);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const showdown = advanceGameStage(game); // stage 4 → 5
    const reset = advanceGameStage(showdown); // stage 5 → 0 (reset)
    expect(reset.winnerHandName).toBe('');
    expect(reset.winnerCards).toHaveLength(0);
    expect(reset.winner).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Reset preserves blind values
// ──────────────────────────────────────────────────────────────────────────────

describe('resetGame (via advanceGameStage)', () => {
  it('preserves custom blind values after reset', () => {
    const game = makeGame(2, 25, 50);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const showdown = advanceGameStage(game);
    const reset = advanceGameStage(showdown);
    expect(reset.smallBlind).toBe(25);
    expect(reset.bigBlind).toBe(50);
  });

  it('clears hands, table cards, and pot after reset', () => {
    const game = makeGame(2);
    game.stage = 4;
    game.players[0].cards = [card('A', 'h'), card('A', 'c')];
    game.players[1].cards = [card('2', 'h'), card('7', 'c')];
    game.tableCards = [
      card('A', 's'), card('A', 'd'), card('5', 'h'), card('6', 'c'), card('8', 'd'),
    ];
    const showdown = advanceGameStage(game);
    const reset = advanceGameStage(showdown);
    expect(reset.stage).toBe(0);
    expect(reset.tableCards).toHaveLength(0);
    expect(reset.pot).toBe(0);
    for (const player of reset.players) {
      expect(player.cards).toHaveLength(0);
      expect(player.isActive).toBe(true);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Chip conservation invariant
// ──────────────────────────────────────────────────────────────────────────────

describe('chip conservation', () => {
  it('total chips (stacks + pot) never change through a full hand with betting', () => {
    let game = makeGame(2);
    const initial = totalChips(game); // 2000

    // Pre-flop — blinds posted automatically
    game = advanceGameStage(game);
    expect(totalChips(game)).toBe(initial);

    // UTG raises 100
    const { result: afterRaise } = raise(game, game.actionOn, 100);
    game = afterRaise!;
    game.actionOn = nextPlayer(game, game.actionOn);
    expect(totalChips(game)).toBe(initial);

    // Opponent calls
    const { result: afterCall } = call(game, game.actionOn);
    game = afterCall!;
    game.actionOn = nextPlayer(game, game.actionOn);
    expect(totalChips(game)).toBe(initial);

    // Flop, turn, river — no betting
    game = advanceGameStage(game);
    expect(totalChips(game)).toBe(initial);
    game = advanceGameStage(game);
    expect(totalChips(game)).toBe(initial);
    game = advanceGameStage(game);
    expect(totalChips(game)).toBe(initial);

    // Showdown + distribution
    game = advanceGameStage(game);
    expect(totalChips(game)).toBe(initial);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Bust mechanics — resetGame marks stack=0 players inactive
// ──────────────────────────────────────────────────────────────────────────────

describe('resetGame (bust mechanics)', () => {
  it('marks a player with stack=0 as inactive after reset', () => {
    // Set up a post-showdown state with one busted player
    const game = makeGame(2);
    game.stage = 5;
    game.players[0].stack = 2000; // won everything
    game.players[1].stack = 0;    // busted

    const reset = advanceGameStage(game);
    expect(reset.players[0].isActive).toBe(true);
    expect(reset.players[1].isActive).toBe(false);
  });

  it('marks all busted players inactive but leaves solvent players active', () => {
    const game = makeGame(3);
    game.stage = 5;
    game.players[0].stack = 3000;
    game.players[1].stack = 0;
    game.players[2].stack = 0;

    const reset = advanceGameStage(game);
    expect(reset.players[0].isActive).toBe(true);
    expect(reset.players[1].isActive).toBe(false);
    expect(reset.players[2].isActive).toBe(false);
  });

  it('preserves chip conservation when one player goes bust', () => {
    // Simulate a hand where player 1 loses everything: pre-flop all-in
    const game = makeGame(2);
    const initial = totalChips(game); // 2000

    let g = advanceGameStage(game); // pre-flop + blinds
    // Player 0 (UTG/SB in 2-player) goes all-in
    const { result: afterAllIn } = raise(g, g.actionOn, g.players[g.actionOn].stack + g.players[g.actionOn].lastBet);
    g = afterAllIn!;
    g.actionOn = nextPlayer(g, g.actionOn);
    // Opponent calls
    const { result: afterCall } = call(g, g.actionOn);
    g = afterCall!;

    // Advance to showdown
    g = advanceGameStage(g); // flop
    g = advanceGameStage(g); // turn
    g = advanceGameStage(g); // river
    g = advanceGameStage(g); // showdown (stage 5)

    expect(totalChips(g)).toBe(initial);

    const reset = advanceGameStage(g); // reset
    expect(totalChips(reset)).toBe(initial);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// postBlinds with busted (inactive) players
// ──────────────────────────────────────────────────────────────────────────────

describe('postBlinds with busted players', () => {
  it('skips a busted seat when assigning the small blind', () => {
    // 3 players: dealer=0, player 1 busted → SB goes to player 2
    const game = makeGame(3);
    game.players[1].stack = 0;
    game.players[1].isActive = false;

    const next = advanceGameStage(game);

    // Player 2 paid SB, player 0 paid BB (wraps), player 1 paid nothing
    expect(next.players[2].lastBet).toBe(10);
    expect(next.players[2].stack).toBe(990);
    expect(next.players[0].lastBet).toBe(20);
    expect(next.players[0].stack).toBe(980);
    expect(next.players[1].lastBet).toBe(0);
    expect(next.players[1].stack).toBe(0);
  });

  it('pot equals SB + BB even when a busted seat is skipped', () => {
    const game = makeGame(3);
    game.players[1].stack = 0;
    game.players[1].isActive = false;

    const next = advanceGameStage(game);
    expect(next.pot).toBe(30); // 10 SB + 20 BB
    expect(next.currentBet).toBe(20);
  });

  it('actionOn skips busted and all-in seats at the start of pre-flop', () => {
    // 4 players: dealer=0, player 1 busted
    // SB=2, BB=3, UTG should be first active non-all-in after BB → player 0
    const game = makeGame(4);
    game.players[1].stack = 0;
    game.players[1].isActive = false;

    const next = advanceGameStage(game);
    // actionOn must not be the busted player
    expect(next.players[next.actionOn].isActive).toBe(true);
    expect(next.players[next.actionOn].isAllIn).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// awardPotDirectly
// ──────────────────────────────────────────────────────────────────────────────

describe('awardPotDirectly', () => {
  it('gives the entire pot to the sole remaining active player', () => {
    const game = makeGame(2);
    game.pot = 200;
    game.players[0].stack = 900;
    game.players[1].isActive = false; // folded

    const result = awardPotDirectly(game);
    expect(result.winner).toEqual([0]);
    expect(result.players[0].stack).toBe(1100); // 900 + 200
    expect(result.pot).toBe(0);
    expect(result.stage).toBe(5);
  });

  it('preserves chip conservation when awarding pot directly', () => {
    const game = makeGame(2);
    game.pot = 300;
    game.players[0].stack = 850;
    game.players[1].isActive = false;
    const initial = totalChips(game);

    const result = awardPotDirectly(game);
    expect(totalChips(result)).toBe(initial);
  });

  it('does not modify the game when multiple active players remain', () => {
    const game = makeGame(2);
    game.pot = 100;

    const result = awardPotDirectly(game);
    expect(result.winner).toHaveLength(0);
    expect(result.pot).toBe(100);
    expect(result.stage).toBe(0); // unchanged
  });

  it('does not mutate the original game', () => {
    const game = makeGame(2);
    game.pot = 200;
    game.players[1].isActive = false;

    awardPotDirectly(game);
    expect(game.pot).toBe(200);
    expect(game.players[0].stack).toBe(1000);
  });
});
