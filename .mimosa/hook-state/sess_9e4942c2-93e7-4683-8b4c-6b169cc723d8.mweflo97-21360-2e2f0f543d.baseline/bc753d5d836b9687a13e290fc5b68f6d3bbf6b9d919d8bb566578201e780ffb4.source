/**
 * Fisher-Yates shuffle using crypto randomness (unbiased, security-scanner clean).
 * Returns a new array; the input is never mutated.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const result = [...items]
  for (let current = result.length - 1; current > 0; current -= 1) {
    const bound = current + 1
    // Rejection sampling keeps the random index uniform across the bound.
    const limit = Math.floor(0x100000000 / bound) * bound
    const buffer = new Uint32Array(1)
    let value: number
    do {
      crypto.getRandomValues(buffer)
      value = buffer[0]!
    } while (value >= limit)
    const swap = value % bound
    ;[result[current], result[swap]] = [result[swap]!, result[current]!]
  }
  return result
}
