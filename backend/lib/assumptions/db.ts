import { Pool, PoolClient } from "pg";
import {
  AssumptionCard,
  AssumptionFeedbackEntry,
  ChatContextSnapshot,
  LearningContext,
  LearningPatternWeight,
  LearningSummary,
  RecentAssumptionRecord,
} from "./types";

let pool: Pool | null = null;
let initializationPromise: Promise<void> | null = null;

function getPool(): Pool {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured");
  }

  pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: connectionString.includes("sslmode=require")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  return pool;
}

async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function ensureAssumptionsTables(): Promise<void> {
  if (initializationPromise) {
    await initializationPromise;
    return;
  }

  initializationPromise = withClient(async (client) => {
    await client.query("BEGIN");

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS assumption_runs (
          run_id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          window_days INTEGER NOT NULL,
          history_count INTEGER NOT NULL,
          generated_at TIMESTAMPTZ NOT NULL,
          model TEXT NOT NULL,
          prompt_version TEXT NOT NULL,
          feature_summary JSONB NOT NULL,
          client_context JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_assumption_runs_user_created
        ON assumption_runs (user_id, created_at DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS assumption_items (
          id BIGSERIAL PRIMARY KEY,
          run_id TEXT NOT NULL REFERENCES assumption_runs(run_id) ON DELETE CASCADE,
          assumption_id TEXT NOT NULL,
          assumption_text TEXT NOT NULL,
          reason TEXT NOT NULL,
          evidence JSONB NOT NULL,
          confidence DOUBLE PRECISION NOT NULL,
          tags TEXT[] NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (run_id, assumption_id)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_assumption_items_run_id
        ON assumption_items (run_id);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS assumption_feedback (
          id BIGSERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          run_id TEXT NOT NULL,
          assumption_id TEXT NOT NULL,
          vote TEXT NOT NULL CHECK (vote IN ('agree', 'disagree')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, run_id, assumption_id)
        );
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_assumption_feedback_user_id
        ON assumption_feedback (user_id, created_at DESC);
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS learning_pattern_weights (
          user_id TEXT NOT NULL,
          pattern_key TEXT NOT NULL,
          weight DOUBLE PRECISION NOT NULL DEFAULT 0,
          agree_count INTEGER NOT NULL DEFAULT 0,
          disagree_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (user_id, pattern_key)
        );
      `);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  await initializationPromise;
}

export async function persistGeneratedRun(params: {
  runId: string;
  userId: string;
  windowDays: number;
  historyCount: number;
  generatedAt: string;
  model: string;
  promptVersion: string;
  featureSummary: Record<string, unknown>;
  clientContext?: Record<string, unknown>;
  assumptions: AssumptionCard[];
}): Promise<void> {
  await ensureAssumptionsTables();

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `
        INSERT INTO assumption_runs (
          run_id,
          user_id,
          window_days,
          history_count,
          generated_at,
          model,
          prompt_version,
          feature_summary,
          client_context
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `,
        [
          params.runId,
          params.userId,
          params.windowDays,
          params.historyCount,
          params.generatedAt,
          params.model,
          params.promptVersion,
          JSON.stringify(params.featureSummary),
          params.clientContext ? JSON.stringify(params.clientContext) : null,
        ]
      );

      for (const assumption of params.assumptions) {
        await client.query(
          `
          INSERT INTO assumption_items (
            run_id,
            assumption_id,
            assumption_text,
            reason,
            evidence,
            confidence,
            tags
          ) VALUES ($1,$2,$3,$4,$5,$6,$7)
        `,
          [
            params.runId,
            assumption.id,
            assumption.assumption,
            assumption.reason,
            JSON.stringify(assumption.evidence),
            assumption.confidence,
            assumption.tags,
          ]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

function toPatternKey(input: string): string | null {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

  return normalized.length >= 3 ? normalized : null;
}

function extractDomainFromSource(source: string): string | null {
  try {
    const parsed = new URL(source);
    return parsed.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function derivePatternKeys(assumptionText: string, tags: string[], evidenceJson: unknown): string[] {
  const keys = new Set<string>();

  for (const tag of tags) {
    const key = toPatternKey(`tag:${tag}`);
    if (key) keys.add(key);
  }

  for (const rawToken of assumptionText.split(/\s+/)) {
    const key = toPatternKey(`term:${rawToken}`);
    if (key) keys.add(key);
    if (keys.size >= 8) break;
  }

  if (Array.isArray(evidenceJson)) {
    for (const evidenceEntry of evidenceJson) {
      if (!evidenceEntry || typeof evidenceEntry !== "object") {
        continue;
      }

      const source =
        "source" in evidenceEntry && typeof evidenceEntry.source === "string"
          ? evidenceEntry.source
          : null;

      if (!source) continue;

      const domain = extractDomainFromSource(source);
      const sourceToken = toPatternKey(domain ? `domain:${domain}` : `source:${source}`);
      if (sourceToken) {
        keys.add(sourceToken);
      }
    }
  }

  return Array.from(keys).slice(0, 12);
}

export async function applyFeedbackAndUpdateLearning(params: {
  userId: string;
  runId: string;
  feedback: AssumptionFeedbackEntry[];
}): Promise<LearningSummary> {
  await ensureAssumptionsTables();

  await withClient(async (client) => {
    await client.query("BEGIN");
    try {
      const assumptionIds = params.feedback.map((entry) => entry.assumptionId);

      const assumptionsLookup = new Map<
        string,
        {
          assumptionText: string;
          tags: string[];
          evidence: unknown;
        }
      >();

      if (assumptionIds.length > 0) {
        const assumptionsResult = await client.query<{
          assumption_id: string;
          assumption_text: string;
          tags: string[];
          evidence: unknown;
        }>(
          `
          SELECT assumption_id, assumption_text, tags, evidence
          FROM assumption_items
          WHERE run_id = $1 AND assumption_id = ANY($2::text[])
        `,
          [params.runId, assumptionIds]
        );

        for (const row of assumptionsResult.rows) {
          assumptionsLookup.set(row.assumption_id, {
            assumptionText: row.assumption_text,
            tags: row.tags,
            evidence: row.evidence,
          });
        }
      }

      for (const entry of params.feedback) {
        await client.query(
          `
          INSERT INTO assumption_feedback (user_id, run_id, assumption_id, vote)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (user_id, run_id, assumption_id)
          DO UPDATE SET vote = EXCLUDED.vote, created_at = NOW()
        `,
          [params.userId, params.runId, entry.assumptionId, entry.vote]
        );

        const matchedAssumption = assumptionsLookup.get(entry.assumptionId);
        if (!matchedAssumption) {
          continue;
        }

        const patternKeys = derivePatternKeys(
          matchedAssumption.assumptionText,
          matchedAssumption.tags,
          matchedAssumption.evidence
        );

        if (patternKeys.length === 0) {
          continue;
        }

        const delta = entry.vote === "agree" ? 1 : -1;
        const agreeIncrement = entry.vote === "agree" ? 1 : 0;
        const disagreeIncrement = entry.vote === "disagree" ? 1 : 0;

        for (const patternKey of patternKeys) {
          await client.query(
            `
            INSERT INTO learning_pattern_weights (
              user_id,
              pattern_key,
              weight,
              agree_count,
              disagree_count,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (user_id, pattern_key)
            DO UPDATE SET
              weight = GREATEST(-25, LEAST(25, learning_pattern_weights.weight + $3)),
              agree_count = learning_pattern_weights.agree_count + $4,
              disagree_count = learning_pattern_weights.disagree_count + $5,
              updated_at = NOW()
          `,
            [params.userId, patternKey, delta, agreeIncrement, disagreeIncrement]
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return getLearningSummary(params.userId);
}

async function queryLearningPatterns(userId: string, whereClause: string): Promise<LearningPatternWeight[]> {
  await ensureAssumptionsTables();

  return withClient(async (client) => {
    const result = await client.query<{
      pattern_key: string;
      weight: number;
      agree_count: number;
      disagree_count: number;
    }>(
      `
      SELECT pattern_key, weight, agree_count, disagree_count
      FROM learning_pattern_weights
      WHERE user_id = $1 AND ${whereClause}
      ORDER BY weight DESC, updated_at DESC
      LIMIT 10
    `,
      [userId]
    );

    return result.rows.map((row) => ({
      patternKey: row.pattern_key,
      weight: row.weight,
      agreeCount: row.agree_count,
      disagreeCount: row.disagree_count,
    }));
  });
}

export async function getLearningSummary(userId: string): Promise<LearningSummary> {
  const strongestPositive = await queryLearningPatterns(userId, "weight > 0");

  const strongestNegative = await withClient(async (client) => {
    const result = await client.query<{
      pattern_key: string;
      weight: number;
      agree_count: number;
      disagree_count: number;
    }>(
      `
      SELECT pattern_key, weight, agree_count, disagree_count
      FROM learning_pattern_weights
      WHERE user_id = $1 AND weight < 0
      ORDER BY weight ASC, updated_at DESC
      LIMIT 10
    `,
      [userId]
    );

    return result.rows.map((row) => ({
      patternKey: row.pattern_key,
      weight: row.weight,
      agreeCount: row.agree_count,
      disagreeCount: row.disagree_count,
    }));
  });

  return {
    strongestPositive,
    strongestNegative,
  };
}

export async function getLearningContext(userId: string): Promise<LearningContext> {
  const summary = await getLearningSummary(userId);

  return {
    positivePatterns: summary.strongestPositive
      .slice(0, 8)
      .map((pattern) => pattern.patternKey),
    negativePatterns: summary.strongestNegative
      .slice(0, 8)
      .map((pattern) => pattern.patternKey),
  };
}

export async function getRecentAssumptionRecords(
  userId: string,
  limit: number = 40
): Promise<RecentAssumptionRecord[]> {
  await ensureAssumptionsTables();

  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));

  return withClient(async (client) => {
    const result = await client.query<{
      assumption_text: string;
      tags: string[];
    }>(
      `
      SELECT ai.assumption_text, ai.tags
      FROM assumption_items ai
      INNER JOIN assumption_runs ar
        ON ar.run_id = ai.run_id
      WHERE ar.user_id = $1
      ORDER BY ar.generated_at DESC, ai.created_at DESC
      LIMIT $2
    `,
      [userId, safeLimit]
    );

    return result.rows.map((row) => ({
      assumption: row.assumption_text,
      tags: Array.isArray(row.tags) ? row.tags : [],
    }));
  });
}

export async function getChatContextSnapshot(
  userId: string,
  limit: number = 16
): Promise<ChatContextSnapshot> {
  await ensureAssumptionsTables();

  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const learningSummary = await getLearningSummary(userId);

  const recentAssumptions = await withClient(async (client) => {
    const result = await client.query<{
      run_id: string;
      assumption_text: string;
      reason: string;
      tags: string[];
      vote: "agree" | "disagree" | null;
    }>(
      `
      SELECT
        ai.run_id,
        ai.assumption_text,
        ai.reason,
        ai.tags,
        af.vote
      FROM assumption_items ai
      INNER JOIN assumption_runs ar
        ON ar.run_id = ai.run_id
      LEFT JOIN assumption_feedback af
        ON af.user_id = $1
       AND af.run_id = ai.run_id
       AND af.assumption_id = ai.assumption_id
      WHERE ar.user_id = $1
      ORDER BY ar.generated_at DESC, ai.created_at DESC
      LIMIT $2
    `,
      [userId, safeLimit]
    );

    return result.rows.map((row) => ({
      runId: row.run_id,
      assumption: row.assumption_text,
      reason: row.reason,
      tags: Array.isArray(row.tags) ? row.tags : [],
      vote: row.vote === "agree" || row.vote === "disagree" ? row.vote : null,
    }));
  });

  return {
    recentAssumptions,
    learningSummary,
  };
}
