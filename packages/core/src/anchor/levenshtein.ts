/** 코드 유닛 단위 Levenshtein 거리. 짧은 스팬(≤200) 전용, 조기 종료 없음. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] as number;
}

/** 1 - 거리/최대길이. 동일하면 1. */
export function similarity(a: string, b: string): number {
  const m = Math.max(a.length, b.length);
  return m === 0 ? 1 : 1 - levenshtein(a, b) / m;
}
