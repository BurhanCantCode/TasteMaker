import test from "node:test";
import assert from "node:assert/strict";
import { extractHistoryFeatures } from "../../lib/assumptions/history";
import type { HistoryEvent } from "../../lib/assumptions/types";

const NOW = Date.parse("2026-03-12T00:00:00.000Z");

test("extractHistoryFeatures builds recency/domain/query signals", () => {
  const history: HistoryEvent[] = [
    {
      url: "https://www.google.com/search?q=attack+shark+keyboard+software",
      title: "attack shark keyboard software - Google Search",
      lastVisitTime: NOW - 2 * 60 * 60 * 1000,
      visitCount: 2,
    },
    {
      url: "https://attackshark.com/pages/driver-download",
      title: "ATTACK SHARK Drivers, Firmware, Software & Manuals",
      lastVisitTime: NOW - 3 * 60 * 60 * 1000,
      visitCount: 1,
    },
    {
      url: "https://dps.psx.com.pk/company/OGDC",
      title: "OGDC - Stock quote",
      lastVisitTime: NOW - 24 * 60 * 60 * 1000,
      visitCount: 4,
    },
  ];

  const summary = extractHistoryFeatures(history, 90, NOW);

  assert.equal(summary.totalEvents, 3);
  assert.equal(summary.recencyBreakdown.last24h, 3);
  assert.equal(summary.topDomains[0].key, "dps.psx.com.pk");
  assert.ok(summary.topSearchQueries.some((query) => query.key.includes("attack shark")));
  assert.ok(summary.notablePatterns.some((pattern) => pattern.toLowerCase().includes("hardware")));
  assert.ok(summary.evidenceCatalog.length > 0);
});

test("extractHistoryFeatures is dynamic and not tied to fixed domain lists", () => {
  const history: HistoryEvent[] = [
    {
      url: "https://example-research.site/insights/weekly-satellites",
      title: "Weekly Satellite Dashboard",
      lastVisitTime: NOW - 10 * 60 * 60 * 1000,
      visitCount: 7,
    },
    {
      url: "https://maps.example.com/search?q=volcano+trail",
      title: "volcano trail map",
      lastVisitTime: NOW - 11 * 60 * 60 * 1000,
      visitCount: 3,
    },
  ];

  const summary = extractHistoryFeatures(history, 90, NOW);

  assert.equal(summary.totalEvents, 2);
  assert.ok(summary.distinctDomains >= 1);
  assert.ok(summary.topIntentTokens.length > 0);
  assert.ok(summary.evidenceCatalog.every((item) => item.url.startsWith("https://")));
});
