export default function ProgressBar({ value = 0, showLabel = true, done, total }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      {showLabel && (
        <div className="progress-label">
          <span>{typeof done === 'number' && typeof total === 'number' ? `${done} / ${total} tasks` : 'Progress'}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
