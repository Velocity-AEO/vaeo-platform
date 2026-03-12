/**
 * tools/chatbot/index.ts
 *
 * Barrel re-export for the Chatbot module.
 */

export const CHATBOT_VERSION = '1.0.0';
export const CHATBOT_MODEL = 'claude-sonnet-4-20250514';

// ── Message ──────────────────────────────────────────────────────────────────

export {
  buildMessage,
  buildSession,
  updateSession,
  type ChatMessage,
  type ChatSession,
  type ChatRole,
} from './message.js';

// ── Context builder ──────────────────────────────────────────────────────────

export {
  buildSiteContext,
  formatContextForPrompt,
  buildSystemPrompt,
  type SiteContext,
} from './context_builder.js';

// ── Chat engine ──────────────────────────────────────────────────────────────

export {
  runChatEngine,
  defaultChatConfig,
  buildQuickReplies,
  type ChatEngineConfig,
} from './chat_engine.js';
