import { describe, expect, it } from "vitest";
import { TRANSFER_MIN_LEAD_MS, transferOffered } from "./transfer";

const NOW = Date.parse("2026-10-12T15:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("transferOffered", () => {
  it("con 3 h o más al inicio se ofrece", () => {
    expect(transferOffered(at(TRANSFER_MIN_LEAD_MS), NOW)).toBe(true);
    expect(transferOffered(at(2 * 24 * 3_600_000), NOW)).toBe(true);
  });

  it("con menos de 3 h no (no alcanza a transferir y que el dueño verifique)", () => {
    expect(transferOffered(at(TRANSFER_MIN_LEAD_MS - 60_000), NOW)).toBe(false);
    expect(transferOffered(at(-60_000), NOW)).toBe(false);
  });

  it("una fecha inválida no se ofrece", () => {
    expect(transferOffered("no-es-fecha", NOW)).toBe(false);
  });
});
