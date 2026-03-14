import test from "node:test";
import assert from "node:assert/strict";
import {
  assertAssumptionBatchIsUnique,
  validateAndNormalizeAssumptionsPayload,
} from "../../lib/assumptions/service";
import { normalizeGenerateBatchSize } from "../../app/api/assumptions/generate/route";

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

test("validateAndNormalizeAssumptionsPayload supports smaller batch sizes", () => {
  const payload = {
    assumptions: Array.from({ length: 5 }, (_, index) => ({
      id: `b-${index + 1}`,
      assumption: `Different assumption ${index + 1}`,
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
      confidence: 0.7,
      tags: ["alpha", "batch_five"],
    })),
  };

  const normalized = validateAndNormalizeAssumptionsPayload(payload, 5);

  assert.equal(normalized.length, 5);
  assert.equal(normalized[4].id, "b-5");
});

test("assertAssumptionBatchIsUnique rejects exact repeats against recent assumptions", () => {
  assert.throws(() =>
    assertAssumptionBatchIsUnique(
      [
        {
          assumption: "You keep circling back to keyboard rabbit holes late at night.",
          tags: ["hardware", "research"],
        },
      ],
      [
        {
          assumption: "You keep circling back to keyboard rabbit holes late at night",
          tags: ["hardware", "research"],
        },
      ]
    )
  );
});

test("assertAssumptionBatchIsUnique rejects normalized text repeats", () => {
  assert.throws(() =>
    assertAssumptionBatchIsUnique([
      {
        assumption: "You are quietly building a keyboard setup ritual.",
        tags: ["hardware", "ritual"],
      },
      {
        assumption: "You are quietly building a keyboard setup ritual!",
        tags: ["hardware", "ritual"],
      },
    ])
  );
});

test("assertAssumptionBatchIsUnique rejects near-duplicate same-theme cards", () => {
  assert.throws(() =>
    assertAssumptionBatchIsUnique([
      {
        assumption: "You treat mechanical keyboard tuning like a deeply personal research project.",
        tags: ["hardware", "keyboards"],
      },
      {
        assumption: "You treat mechanical keyboard tuning like a very personal research project.",
        tags: ["hardware", "keyboards"],
      },
    ])
  );
});

test("assertAssumptionBatchIsUnique allows distinct cards with shared domains", () => {
  assert.doesNotThrow(() =>
    assertAssumptionBatchIsUnique([
      {
        assumption: "You use market dashboards to keep a pulse on daily energy-sector volatility.",
        tags: ["markets", "energy"],
      },
      {
        assumption: "You compare brokerage interfaces because you care more about execution feel than brand loyalty.",
        tags: ["markets", "brokerage"],
      },
    ])
  );
});

test("normalizeGenerateBatchSize clamps invalid values", () => {
  assert.equal(normalizeGenerateBatchSize(undefined), 10);
  assert.equal(normalizeGenerateBatchSize(0), 1);
  assert.equal(normalizeGenerateBatchSize(5.9), 5);
  assert.equal(normalizeGenerateBatchSize(99), 10);
});
