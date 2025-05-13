/* ------------------------------------------------- */
/* File: src/utils/random.ts                         */
/* ------------------------------------------------- */
export function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}