// Runs one round's challenges in order. Pure TypeScript with no Pixi import.
import type { Direction } from "../direction.ts";
import { HoldRule } from "./hold.ts";
import { ManyRule } from "./many.ts";
import type { ChallengeRule, ChallengeSpec, RuleContext } from "./rule.ts";
import { SequenceRule } from "./sequence.ts";

export const createRule = (spec: ChallengeSpec, context: RuleContext): ChallengeRule => {
  if (spec.kind === "sequence") {
    return new SequenceRule(spec.directions, context);
  }

  return spec.kind === "hold" ? new HoldRule(spec.direction, context) : new ManyRule(spec.direction, context);
};

/**
 * A round: its challenges one after another, each built fresh when the previous one completes (in the same call, as
 * the original spawns the next challenge at once). Input goes to the current challenge only, under the contract on
 * ChallengeRule; events after the round is done are ignored. The next challenge starts with nothing held, so a Hold
 * right after a challenge needs a new press.
 *
 * `context.onDone` (if given) is called once, when the last challenge completes. Use `onChallengeDone` to learn about
 * each challenge (e.g. to redraw the arrows); it runs after `index` has moved on.
 */
export class Round {
  readonly specs: readonly ChallengeSpec[];
  private readonly context: RuleContext;
  private readonly onChallengeDone: ((completedIndex: number) => void) | undefined;
  private currentIndex = 0;
  private rule: ChallengeRule | undefined;

  constructor(
    specs: readonly ChallengeSpec[],
    context: RuleContext,
    onChallengeDone?: (completedIndex: number) => void,
  ) {
    if (specs.length === 0) {
      throw new RangeError("A round needs at least one challenge");
    }

    this.specs = specs;
    this.context = context;
    this.onChallengeDone = onChallengeDone;
    this.rule = this.build(0);
  }

  /** Index of the current challenge; equals `specs.length` once the round is done. */
  get index(): number {
    return this.currentIndex;
  }

  /** The current challenge's rule, or undefined once the round is done. */
  get current(): ChallengeRule | undefined {
    return this.rule;
  }

  get done(): boolean {
    return this.rule === undefined;
  }

  press(dir: Direction): void {
    this.rule?.press(dir);
  }

  release(dir: Direction): void {
    this.rule?.release(dir);
  }

  cancelAll(): void {
    this.rule?.cancelAll();
  }

  /** Resets the current challenge's progress (`ChallengeRule.reset`): the pause's resume. */
  resetCurrent(): void {
    this.rule?.reset();
  }

  private build(index: number): ChallengeRule | undefined {
    const spec = this.specs[index];

    if (spec === undefined) {
      return undefined;
    }

    return createRule(spec, { ...this.context, onDone: () => this.advance(index) });
  }

  private advance(completed: number): void {
    this.currentIndex = completed + 1;
    this.rule = this.build(this.currentIndex);
    this.onChallengeDone?.(completed);

    if (this.rule === undefined) {
      this.context.onDone?.();
    }
  }
}
