/**
 * tools/chatbot/message.ts
 */

import { randomUUID } from 'node:crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  message_id: string;
  session_id: string;
  site_id:    string;
  role:       ChatRole;
  content:    string;
  created_at: string;
  metadata?:  Record<string, unknown>;
}

export interface ChatSession {
  session_id:       string;
  site_id:          string;
  started_at:       string;
  last_active:      string;
  message_count:    number;
  context_summary?: string;
}

// ── buildMessage ──────────────────────────────────────────────────────────────

export function buildMessage(
  session_id: string,
  site_id:    string,
  role:       ChatRole,
  content:    string,
  metadata?:  Record<string, unknown>,
): ChatMessage {
  try {
    const msg: ChatMessage = {
      message_id: randomUUID(),
      session_id,
      site_id,
      role,
      content,
      created_at: new Date().toISOString(),
    };
    if (metadata !== undefined) msg.metadata = metadata;
    return msg;
  } catch {
    return {
      message_id: randomUUID(),
      session_id: session_id ?? '',
      site_id:    site_id ?? '',
      role:       'user',
      content:    content ?? '',
      created_at: new Date().toISOString(),
    };
  }
}

// ── buildSession ──────────────────────────────────────────────────────────────

export function buildSession(site_id: string): ChatSession {
  try {
    const now = new Date().toISOString();
    return {
      session_id:    randomUUID(),
      site_id,
      started_at:    now,
      last_active:   now,
      message_count: 0,
    };
  } catch {
    const now = new Date().toISOString();
    return {
      session_id:    randomUUID(),
      site_id:       site_id ?? '',
      started_at:    now,
      last_active:   now,
      message_count: 0,
    };
  }
}

// ── updateSession ─────────────────────────────────────────────────────────────

export function updateSession(session: ChatSession, new_message: ChatMessage): ChatSession {
  try {
    return {
      ...session,
      message_count: (session.message_count ?? 0) + 1,
      last_active:   new_message.created_at ?? new Date().toISOString(),
    };
  } catch {
    return session ?? buildSession('');
  }
}
