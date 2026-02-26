import { useState } from 'react';
import HomeScreen from './welcome/HomeScreen';
import CreateRoomScreen from './welcome/CreateRoomScreen';
import RoomCreatedScreen from './welcome/RoomCreatedScreen';
import JoinCodeScreen from './welcome/JoinCodeScreen';
import JoinNameScreen from './welcome/JoinNameScreen';
import RoomNotFoundScreen from './welcome/RoomNotFoundScreen';
import { getRoomFromUrl } from '../lib/clientSession';

type Step = 'home' | 'create' | 'create-confirm' | 'join-code' | 'join-name' | 'not-found';

interface Props {
  setupRoom: (userId: string, roomId: string, smallBlind?: number, bigBlind?: number, aiCount?: number) => void;
}

const STEP_TITLES: Record<Step, string> = {
  'home':           'PIXEL POKER',
  'create':         'CREATE ROOM',
  'create-confirm': 'ROOM READY',
  'join-code':      'JOIN ROOM',
  'join-name':      'JOIN ROOM',
  'not-found':      'ROOM NOT FOUND',
};

function WelcomeView({ setupRoom }: Props) {
  // If ?room= is in the URL (shared link or failed rejoin), skip to join-name
  const urlRoom = getRoomFromUrl();
  const [step, setStep] = useState<Step>(urlRoom ? 'join-name' : 'home');

  // Data carried between steps
  const [pendingCode, setPendingCode] = useState(urlRoom ?? '');
  const [pendingSmallBlind, setPendingSmallBlind] = useState(10);
  const [pendingBigBlind, setPendingBigBlind] = useState(20);
  const [pendingPlayerName, setPendingPlayerName] = useState('');
  const [pendingAiCount, setPendingAiCount] = useState(0);

  const handleCreated = (code: string, playerName: string, sb: number, bb: number, aiCount: number) => {
    setPendingCode(code);
    setPendingSmallBlind(sb);
    setPendingBigBlind(bb);
    setPendingPlayerName(playerName);
    setPendingAiCount(aiCount);
    setStep('create-confirm');
  };

  const handleEnterCreatedRoom = () => {
    setupRoom(pendingPlayerName, pendingCode, pendingSmallBlind, pendingBigBlind, pendingAiCount);
  };

  const handleCodeFound = (code: string) => {
    setPendingCode(code);
    setStep('join-name');
  };

  const handleCodeNotFound = (code: string) => {
    setPendingCode(code);
    setStep('not-found');
  };

  const handleJoin = (playerName: string) => {
    setupRoom(playerName, pendingCode);
  };

  const renderContent = () => {
    switch (step) {
      case 'home':
        return (
          <HomeScreen
            onCreate={() => setStep('create')}
            onJoin={() => setStep('join-code')}
          />
        );
      case 'create':
        return (
          <CreateRoomScreen
            onCreated={handleCreated}
            onBack={() => setStep('home')}
          />
        );
      case 'create-confirm':
        return (
          <RoomCreatedScreen
            roomCode={pendingCode}
            onEnter={handleEnterCreatedRoom}
          />
        );
      case 'join-code':
        return (
          <JoinCodeScreen
            onFound={handleCodeFound}
            onNotFound={handleCodeNotFound}
            onBack={() => setStep('home')}
          />
        );
      case 'join-name':
        return (
          <JoinNameScreen
            roomCode={pendingCode}
            onJoin={handleJoin}
            onBack={() => setStep('join-code')}
          />
        );
      case 'not-found':
        return (
          <RoomNotFoundScreen
            roomCode={pendingCode}
            onTryAgain={() => setStep('join-code')}
            onCreate={() => setStep('create')}
          />
        );
    }
  };

  return (
    <div
      className="flex flex-col gap-6 justify-center items-center mx-auto mt-28 p-8 w-96 bg-vice-surface border-2 border-vice-violet"
      style={{ boxShadow: '6px 6px 0 #7B2FBE80, 0 0 40px #7B2FBE25' }}
    >
      {/* Header */}
      <div className="text-center space-y-2 w-full">
        <div className="flex justify-center gap-3 text-vice-gold/40 text-sm mb-1">
          <span>♠</span><span>♥</span><span>♣</span><span>♦</span>
        </div>
        <h1 className="text-vice-pink text-3xl font-bold tracking-widest uppercase leading-snug">
          {STEP_TITLES[step]}
        </h1>
        {step === 'home' && (
          <p className="text-vice-gold text-base tracking-widest opacity-70">
            INSERT COIN TO PLAY
            <span className="animate-blink ml-0.5">█</span>
          </p>
        )}
        <div className="flex justify-center gap-3 text-vice-gold/40 text-sm mt-1">
          <span>♦</span><span>♣</span><span>♥</span><span>♠</span>
        </div>
        <div className="border-t border-vice-violet/40 pt-2" />
      </div>

      {/* Step content */}
      {renderContent()}
    </div>
  );
}

export default WelcomeView;
