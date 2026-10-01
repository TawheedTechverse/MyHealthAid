import { useEffect, useState } from 'react';

// Total time the splash stays up before it starts fading out. Keep this
// short — it's a one-time flourish, not something people wait through.
const AUTO_LEAVE_MS = 2200;
// Must match the CSS fade-out animation duration (.splash-leaving).
const LEAVE_TRANSITION_MS = 450;

/**
 * Full-screen intro shown once per page load: logo reveal, then the wordmark,
 * then the motto. Click/tap or "Skip" dismisses it immediately; otherwise it
 * leaves on its own after AUTO_LEAVE_MS.
 */
export default function SplashScreen({ onDone }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLeaving(true), AUTO_LEAVE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(onDone, LEAVE_TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [leaving, onDone]);

  return (
    <div
      className={`splash ${leaving ? 'splash-leaving' : ''}`}
      onClick={() => setLeaving(true)}
    >
      <div className="splash-mark" aria-hidden="true">
        +
      </div>
      <h1 className="splash-word">MyHealthAid</h1>
      <p className="splash-motto">Shared treatment tracking for patients &amp; doctors</p>
      <button
        type="button"
        className="btn btn-ghost btn-sm splash-skip"
        onClick={(e) => {
          e.stopPropagation();
          setLeaving(true);
        }}
      >
        Skip
      </button>
    </div>
  );
}
