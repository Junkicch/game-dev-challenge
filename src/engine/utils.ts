export function id(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function now(): number {
  return Date.now();
}

export function performanceNow(): number {
  return performance.now();
}
