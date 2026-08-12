/**
 * Shown instead of the app when the build has no usable server URL. A build
 * that cannot reach a server is broken, so it says so loudly rather than
 * rendering a lobby whose buttons quietly do nothing.
 */
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex flex-col justify-center items-center w-full min-h-screen bg-vice-bg text-white gap-4 px-6">
      <p className="text-vice-pink text-2xl font-bold tracking-widest uppercase">
        MISCONFIGURED BUILD
      </p>
      <p className="text-vice-muted text-xs tracking-widest uppercase">
        THE CLIENT HAS NO GAME SERVER
      </p>
      <p className="max-w-xl text-center text-vice-gold/80 text-xs leading-relaxed">{message}</p>
    </div>
  );
}

export default ConfigErrorScreen;
