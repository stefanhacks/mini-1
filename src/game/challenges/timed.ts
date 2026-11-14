// A challenge with a time limit, for endless mode (endless-plan.md). Pure TypeScript with no Pixi import. Written by
// Claude Code.
import type { TimerHandle } from "../../core/clock.ts";
import type { Direction } from "../direction.ts";
import { createRule } from "./round.ts";
import type { ChallengeProgress, ChallengeRule, ChallengeSpec, RuleContext } from "./rule.ts";

/**
 * Wraps the challenge's own rule, unchanged, with a deadline on the context's scope (so it pauses with the clock and
 * dies with the state):
 * - `context.onDone` runs when the challenge completes in time; `onTimeout` when the limit passes first. Exactly one of
 *   them runs, once. After either, every input is ignored.
 * - The deadline counts from construction. `reset` (the pause's resume) resets the rule's progress and restarts it.
 * - Boundaries, as on ChallengeRule: input is drained after the clock ticks, so a press at exactly the limit is late;
 *   a completion inside the tick that reaches the limit (a Hold held to its end) is in time, because the deadline only
 *   expires after the other timers due at that moment.
 */
export class TimedChallenge implements ChallengeRule {
  readonly spec: ChallengeSpec;
  readonly limitMs: number;
  private readonly rule: ChallengeRule;
  private readonly context: RuleContext;
  private readonly onTimeout: () => void;
  private startedAt: number;
  private deadline: TimerHandle | undefined;
  private endedAt: number | undefined;
  private expired = false;

  constructor(spec: ChallengeSpec, context: RuleContext, limitMs: number, onTimeout: () => void) {
    if (!(limitMs > 0)) {
      throw new RangeError(`A time limit must be > 0, got ${limitMs}`);
    }

    this.limitMs = limitMs;
    this.context = context;
    this.onTimeout = onTimeout;
    this.rule = createRule(spec, { ...context, onDone: () => this.complete() });
    this.spec = this.rule.spec;
    this.startedAt = context.now();
    this.startDeadline();
  }

  get done(): boolean {
    return this.rule.done;
  }

  /** Whether the limit passed before the challenge completed. */
  get timedOut(): boolean {
    return this.expired;
  }

  get progress(): ChallengeProgress {
    return this.rule.progress;
  }

  /** Game time left, in ms: frozen when the challenge completes, 0 once it timed out. */
  get remainingMs(): number {
    const at = this.endedAt ?? this.context.now();

    return this.expired ? 0 : Math.min(this.limitMs, Math.max(0, this.limitMs - (at - this.startedAt)));
  }

  press(dir: Direction): void {
    if (!this.expired) {
      this.rule.press(dir);
    }
  }

  release(dir: Direction): void {
    if (!this.expired) {
      this.rule.release(dir);
    }
  }

  cancelAll(): void {
    if (!this.expired) {
      this.rule.cancelAll();
    }
  }

  reset(): void {
    if (this.expired || this.rule.done) {
      return;
    }

    this.rule.reset();
    this.stopDeadline();
    this.startedAt = this.context.now();
    this.startDeadline();
  }

  private startDeadline(): void {
    const { scope } = this.context;

    // The second step lets the timers due at the same moment (a Hold's completion) fire first: `after(0)` is due now,
    // scheduled after them.
    this.deadline = scope.after(this.limitMs, () => {
      this.deadline = scope.after(0, () => {
        this.deadline = undefined;
        this.expire();
      });
    });
  }

  private stopDeadline(): void {
    if (this.deadline !== undefined) {
      this.context.scope.cancel(this.deadline);
      this.deadline = undefined;
    }
  }

  private complete(): void {
    this.stopDeadline();
    this.endedAt = this.context.now();
    this.context.onDone?.();
  }

  private expire(): void {
    if (this.rule.done) {
      return;
    }

    this.expired = true;
    this.endedAt = this.context.now();
    // Drops the rule's own timers (a running hold, a Sequence's gap) so nothing completes after the timeout.
    this.rule.reset();
    this.onTimeout();
  }
}
