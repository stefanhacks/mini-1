import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CLIPS } from "../../assets/anims.ts";
import type { Clip } from "../../core/anim/clip.ts";
import {
  ENDING_CARD_SPEED,
  ENDING_MS,
  TITLE_AMBIENT,
  TITLE_CUES,
  TITLE_EXIT_MS,
  TITLE_PROMPT_MS,
  TITLE_REVEAL_FLASH_MS,
} from "./timings.ts";

const eventMs = (clip: Clip, name: string) => {
  const event = clip.events.find((candidate) => candidate.functionName === name);

  assert.ok(event !== undefined, `no ${name} event`);

  return Math.round(event.time * 1000);
};

describe("timings against the clips' events", () => {
  it("leaves Title at Inicio's FimInicio, its fade-outs lasting as long", () => {
    assert.equal(eventMs(CLIPS.inicio, "Inicio"), 0);
    assert.equal(eventMs(CLIPS.inicio, "FimInicio"), TITLE_EXIT_MS);
    assert.equal(CLIPS.fadeOut.length * 1000, TITLE_EXIT_MS);
    assert.equal(CLIPS.tmpFadeOut.length * 1000, TITLE_EXIT_MS);
  });

  it("plays the ending at Fim's events, the black half a second after FimFade and full before FimFinal", () => {
    assert.equal(eventMs(CLIPS.fim, "FimBarco"), ENDING_MS.thrown);
    assert.equal(eventMs(CLIPS.fim, "FimKraken"), ENDING_MS.kraken);
    assert.equal(eventMs(CLIPS.fim, "FimFinal"), ENDING_MS.sea);
    assert.ok(ENDING_MS.black > eventMs(CLIPS.fim, "FimFade"));
    assert.ok(ENDING_MS.black - eventMs(CLIPS.fim, "FimFade") < 1000, "within the animator's exit-time window");
    assert.ok(ENDING_MS.black + CLIPS.fadeIn.length * 1000 <= ENDING_MS.sea);
  });

  it("lifts the black at TelaPreta's exit times: 0.5 s into the ending, and at the first one after FimFinal", () => {
    assert.ok(ENDING_MS.lift > 0 && ENDING_MS.lift < 1000, "within the animator's exit-time window");
    // FadeIn's exit time 0.75 recurs each 1 s from its start at `black`.
    assert.equal((ENDING_MS.seaLift - ENDING_MS.black) % 1000, 750);
    assert.ok(ENDING_MS.seaLift > ENDING_MS.sea && ENDING_MS.seaLift - ENDING_MS.sea < 1000);
  });

  it("fades the replay prompt in after the card, as long after it as Title's prompt after its logo", () => {
    const logoAt = (TITLE_CUES.at(-1)?.at ?? 0) + TITLE_REVEAL_FLASH_MS;
    const cardIn = ENDING_MS.card + (CLIPS.fadeIn.length * 1000) / ENDING_CARD_SPEED;

    assert.equal(ENDING_MS.prompt, cardIn + TITLE_PROMPT_MS - logoAt);
  });

  it("shows the prompt where the ambient lightning starts counting", () => {
    assert.equal(TITLE_AMBIENT.from, TITLE_PROMPT_MS);
  });
});
