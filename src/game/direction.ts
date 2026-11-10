// The four headings the voice gives. Shared by the challenge rules, the input router and the views. Pure TypeScript.

export type Direction = "up" | "down" | "left" | "right";

/** In the original's arrow order (KeyManager.cs: Down, Left, Right, Up), so a seeded RNG index maps the same way. */
export const DIRECTIONS: readonly Direction[] = ["down", "left", "right", "up"];
