// The four headings the voice gives. Shared by the challenge rules, the input router and the views. Pure TypeScript.

export type Direction = "up" | "down" | "left" | "right";

/**
 * In the original's arrow order (KeyManager.cs: Down, Left, Right, Up), so the draw ORDER matches the original. The
 * outcomes don't: Unity's Random differs from our seeded RNG, so a seed doesn't reproduce an original game.
 */
export const DIRECTIONS: readonly Direction[] = ["down", "left", "right", "up"];
