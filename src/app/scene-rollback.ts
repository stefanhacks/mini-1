// Undoing a failed scene build: what it added to the layers is destroyed, so a retry starts from the layers as they
// were. Pure TypeScript: it works on anything shaped like a Pixi Container. Written by Claude Code.

/** The Container side the rollback uses. */
export interface ChildParent {
  readonly children: readonly unknown[];
  removeChildren(beginIndex?: number): { destroy(options: { children: boolean }): void }[];
}

/** Each parent's child count now: pass it to `removeChildrenAddedSince` later. */
export const countChildren = (parents: readonly ChildParent[]) => parents.map((parent) => parent.children.length);

/**
 * Removes and destroys (with their children) the children each parent got after `counts` was taken. Relies on the
 * scene modules only appending to the layers, synchronously (m4-refactor.md, rule 6).
 */
export const removeChildrenAddedSince = (parents: readonly ChildParent[], counts: readonly number[]) => {
  parents.forEach((parent, index) => {
    // Pixi's removeChildren(begin) throws a RangeError when nothing was added after `begin` on a non-empty parent,
    // which would hide the build's own error from the report.
    if (parent.children.length <= (counts[index] ?? 0)) {
      return;
    }

    for (const child of parent.removeChildren(counts[index])) {
      child.destroy({ children: true });
    }
  });
};
