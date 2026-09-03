/**
 * Unit — SafetyService pattern hit / miss (T-M12-01).
 *
 * Covers ≥1 VN + ≥1 EN hit and ≥1 miss (plan acceptance).
 * Do not assert / log the matched crisis text bodies — use opaque categories / hit flags.
 */

import { CRISIS_PHRASES_EN, CRISIS_PHRASES_VI } from "./fixtures/crisis-phrases";
import { SafetyService } from "./safety.service";

describe("SafetyService (unit)", () => {
  const service = new SafetyService();

  it("English crisis pattern hits safe-listener", async () => {
    const result = await service.checkUserText({
      userId: "u-en",
      sessionId: "s-en",
      // Fixture index 0 — do not print body in expect messages.
      text: CRISIS_PHRASES_EN[0],
    });
    expect(result.hit).toBe(true);
    expect(result.mode).toBe("safe-listener");
    expect(result.category).toBe("self-harm");
    expect(service.resources().length).toBeGreaterThan(0);
  });

  it("Vietnamese crisis pattern hits safe-listener", async () => {
    const result = await service.checkUserText({
      userId: "u-vi",
      sessionId: "s-vi",
      text: CRISIS_PHRASES_VI[0],
    });
    expect(result.hit).toBe(true);
    expect(result.mode).toBe("safe-listener");
    expect(result.category).toBe("self-harm");
  });

  it("benign text misses (no hit)", async () => {
    const result = await service.checkUserText({
      userId: "u-ok",
      sessionId: "s-ok",
      text: "Tôi muốn luyện phỏng vấn cho vị trí kỹ sư phần mềm.",
    });
    expect(result.hit).toBe(false);
    expect(result.mode).toBe("normal");
    expect(result.category).toBeUndefined();
  });
});
