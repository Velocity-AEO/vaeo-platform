/**
 * tools/chatbot/chat_engine.ts
 */

import { buildSystemPrompt, type SiteContext } from './context_builder.js';
import type { ChatMessage } from './message.js';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ChatEngineConfig {
  model:         string;
  max_tokens:    number;
  temperature:   number;
  system_prompt: string;
}

// ── defaultChatConfig ─────────────────────────────────────────────────────────

export function defaultChatConfig(system_prompt: string): ChatEngineConfig {
  try {
    return {
      model:         'claude-sonnet-4-20250514',
      max_tokens:    500,
      temperature:   0.7,
      system_prompt: system_prompt ?? '',
    };
  } catch {
    return {
      model:         'claude-sonnet-4-20250514',
      max_tokens:    500,
      temperature:   0.7,
      system_prompt: '',
    };
  }
}

// ── Error message ─────────────────────────────────────────────────────────────

const ERROR_RESPONSE =
  "I am having trouble accessing your site data right now. Please try again in a moment.";

// ── runChatEngine ─────────────────────────────────────────────────────────────

export async function runChatEngine(
  messages: ChatMessage[],
  context:  SiteContext,
  deps?: {
    callClaude?: (
      config:   ChatEngineConfig,
      messages: Array<{ role: string; content: string }>,
    ) => Promise<string>;
  },
): Promise<string> {
  try {
    const system_prompt = buildSystemPrompt(context);
    const config        = defaultChatConfig(system_prompt);

    // Only pass user/assistant messages (not system) in the messages array
    const formatted = (messages ?? [])
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    if (deps?.callClaude) {
      return await deps.callClaude(config, formatted);
    }

    // Real Claude API call via dynamic import (avoids hard dep in tests)
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const client    = new Anthropic();
      const response  = await client.messages.create({
        model:      config.model,
        max_tokens: config.max_tokens,
        system:     config.system_prompt,
        messages:   formatted as Array<{ role: 'user' | 'assistant'; content: string }>,
      });
      const block = response.content[0];
      if (block?.type === 'text') return block.text;
      return ERROR_RESPONSE;
    } catch {
      return ERROR_RESPONSE;
    }
  } catch {
    return ERROR_RESPONSE;
  }
}

// ── buildQuickReplies ─────────────────────────────────────────────────────────

export function buildQuickReplies(context: SiteContext): string[] {
  try {
    const c   = context ?? {} as SiteContext;
    const qs: string[] = [];

    qs.push('What should I fix first?');

    if ((c.health_score ?? 100) < 60) {
      qs.push('Why is my health score low?');
    }
    if (c.ranking_trend === 'declining') {
      qs.push('Why are my rankings dropping?');
    }
    if ((c.open_issues ?? 0) > 10) {
      qs.push('What are my biggest issues?');
    }
    if ((c.ai_visibility_score ?? 100) < 40) {
      qs.push('How can I improve my AI visibility?');
    }

    qs.push('What has VAEO fixed recently?');

    return qs;
  } catch {
    return ['What should I fix first?', 'What has VAEO fixed recently?'];
  }
}
