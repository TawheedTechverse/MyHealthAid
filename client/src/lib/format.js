/** Format an ISO timestamp as e.g. "10 Sep 2026, 3:42 PM". */
export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Format an ISO date (YYYY-MM-DD or full ISO) as a friendly, relative-ish label. */
export function formatDueDate(value) {
  if (!value) return 'No due date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No due date';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target - today) / 86_400_000);
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return 'Due yesterday';
  if (diffDays < 0) return `Overdue by ${Math.abs(diffDays)} days`;
  if (diffDays <= 7) return `Due in ${diffDays} days`;

  return `Due ${date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}
