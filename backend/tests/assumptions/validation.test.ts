import test from "node:test";
import assert from "node:assert/strict";
import { validateAndNormalizeAssumptionsPayload } from "../../lib/assumptions/service";

test("validateAndNormalizeAssumptionsPayload enforces 10 cards and 2 evidence entries", () => {
  const payload = {
    assumptions: Array.from({ length: 10 }, (_, index) => ({
      id: `a-${index + 1}`,
      assumption: `Assumption ${index + 1}`,
      reason: "Reason",
      evidence: [
        {
          signal: "Signal one",
          source: "https://example.com/a",
          eventId: "event-1",
        },
        {
          signal: "Signal two",
          source: "https://example.com/b",
          eventId: "event-2",
        },
      ],
      confidence: 0.8,
      tags: ["alpha", "beta"],
    })),
  };

  const normalized = validateAndNormalizeAssumptionsPayload(payload);

  assert.equal(normalized.length, 10);
  assert.equal(normalized[0].evidence.length, 2);
  assert.equal(normalized[0].confidence, 0.8);
  assert.deepEqual(normalized[0].tags, ["alpha", "beta"]);
});

test("validateAndNormalizeAssumptionsPayload rejects malformed evidence", () => {
  const payload = {
    assumptions: Array.from({ length: 10 }, (_, index) => ({
      id: `a-${index + 1}`,
      assumption: `Assumption ${index + 1}`,
      reason: "Reason",
      evidence: [{ signal: "Only one", source: "https://example.com" }],
      confidence: 0.8,
      tags: ["alpha"],
    })),
  };

  assert.throws(() => validateAndNormalizeAssumptionsPayload(payload));
});
