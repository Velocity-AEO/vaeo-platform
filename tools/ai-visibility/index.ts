/**
 * tools/ai-visibility/index.ts
 *
 * Barrel re-export for the AI Visibility module.
 * Provides unified access to all AI visibility tools.
 */

// ── Version ──────────────────────────────────────────────────────────────────

export const AI_VISIBILITY_VERSION = '1.0.0';

export const AI_SOURCES_SUPPORTED = [
  'perplexity',
  'google_ai_overview',
  'chatgpt',
  'bing_copilot',
] as const;

// ── Citation types and builders ──────────────────────────────────────────────

export {
  buildCitation,
  buildCitationSummary,
  type AICitation,
  type AICitationSource,
  type AICitationSummary,
} from './citation.js';

// ── Query generation ─────────────────────────────────────────────────────────

export {
  buildQuerySet,
  type AIQuery,
  type QueryCategory,
} from './query_generator.js';

// ── Perplexity simulator ─────────────────────────────────────────────────────

export {
  simulatePerplexityCitation,
  simulatePerplexityBatch,
  simulatePerplexityResult,
  simulateCitationCheck,
  type PerplexityResult,
} from './perplexity_simulator.js';

// ── Google AI Overview simulator ─────────────────────────────────────────────

export {
  simulateGoogleAIO,
  simulateGoogleAIOBatch,
  buildAIOCitations,
  type GoogleAIOResult,
} from './google_aio_simulator.js';

// ── Unified signal ───────────────────────────────────────────────────────────

export {
  buildUnifiedSignal,
  generateUnifiedReport,
  type UnifiedAISignal,
} from './unified_signal.js';

// ── Visibility score ─────────────────────────────────────────────────────────

export {
  computeAIVisibilityScore,
  computeScoreHistory,
  type AIVisibilityScore,
} from './visibility_score.js';

// ── Visibility history ───────────────────────────────────────────────────────

export {
  buildVisibilitySnapshot,
  simulateVisibilityHistory,
  computeVisibilityTrend,
  type AIVisibilitySnapshot,
} from './visibility_history.js';

// ── Competitor gap ───────────────────────────────────────────────────────────

export {
  analyzeCompetitorGap,
  getTopOpportunities,
  type CompetitorGap,
} from './competitor_gap.js';

// ── Schema opportunity ───────────────────────────────────────────────────────

export {
  simulateSchemaOpportunities,
  type SchemaOpportunity,
} from './schema_opportunity.js';

// ── Orchestrator ─────────────────────────────────────────────────────────────

export {
  generateAIVisibilityReport,
  type AIVisibilityReport,
} from './ai_visibility_orchestrator.js';
