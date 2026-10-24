// Calendar-date helpers. Everything is a local YYYY-MM-DD string, so no timezone drift.

export const isoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const parseIso = (s: string): Date => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export const daysBetween = (a: string, b: string): number =>
  Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);

export const addDays = (s: string, n: number): string => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

// DOZENTIMES_NOW pins the clock for tests and replays.
export const today = (): string => process.env.DOZENTIMES_NOW ?? isoDate(new Date());
