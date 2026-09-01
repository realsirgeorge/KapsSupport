export function relativeTime(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ageLabel(dateInput: string | Date): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  const hours = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60));
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function isAging(createdAt: string | Date, thresholdDays = 3): boolean {
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const days = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return days > thresholdDays;
}

const OPEN_STATUSES = new Set(['new', 'assigned', 'in_progress', 'pending', 'resolved', 'reopened']);

export function isOpenStatus(status: string): boolean {
  return OPEN_STATUSES.has(status);
}
