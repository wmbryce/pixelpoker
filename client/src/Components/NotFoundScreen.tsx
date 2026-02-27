import { useEffect, useState } from 'react';

function NotFoundScreen() {
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(id);
          window.location.replace('/');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col justify-center items-center w-full min-h-screen bg-vice-bg text-white gap-4">
      <p className="text-vice-pink text-4xl font-bold tracking-widest uppercase">404</p>
      <p className="text-vice-muted text-sm tracking-widest uppercase">PAGE NOT FOUND</p>
      <p className="text-vice-gold/60 text-xs tracking-widest">
        RETURNING TO LOBBY IN {seconds}…
      </p>
      <button
        onClick={() => window.location.replace('/')}
        className="mt-2 bg-vice-violet text-white px-6 py-2 text-xs font-bold tracking-widest uppercase btn-pixel hover:brightness-110"
      >
        GO NOW
      </button>
    </div>
  );
}

export default NotFoundScreen;
