export default function Spinner({ full = false }) {
  if (full) {
    return (
      <div className="center-screen">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    );
  }
  return <div className="spinner" role="status" aria-label="Loading" />;
}
