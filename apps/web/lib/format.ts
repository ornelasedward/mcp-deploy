export function formatUsd(n: number) {
  return `$${n.toFixed(4)}`;
}

export function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTime(d: Date | string) {
  return new Date(d).toLocaleString();
}
