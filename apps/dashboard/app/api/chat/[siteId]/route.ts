import { NextRequest, NextResponse } from 'next/server';
import { buildSiteContext } from '@tools/chatbot/context_builder';
import { buildMessage, buildSession } from '@tools/chatbot/message';
import { runChatEngine, buildQuickReplies } from '@tools/chatbot/chat_engine';
import type { ChatMessage } from '@tools/chatbot/message';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  try {
    const { siteId } = await params;
    const domain     = siteId;

    const body = await req.json().catch(() => ({})) as {
      message?:  string;
      session_id?: string;
      history?:  Array<{ role: string; content: string }>;
    };

    const userText = (body.message ?? '').trim();
    if (!userText) {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 },
      );
    }

    // Build context for this site
    const context = buildSiteContext(siteId, domain);

    // Build or reuse session
    const session    = buildSession(siteId);
    const session_id = body.session_id ?? session.session_id;

    // Reconstruct history as ChatMessages
    const history: ChatMessage[] = (body.history ?? []).map(h =>
      buildMessage(session_id, siteId, h.role as 'user' | 'assistant', h.content),
    );

    // Add current user message
    const userMsg = buildMessage(session_id, siteId, 'user', userText);
    const messages = [...history, userMsg];

    // Run engine with injectable Claude dep configured via env
    const response = await runChatEngine(messages, context, {
      callClaude: async (config, msgs) => {
        // Dynamic import to avoid hard dep in tests
        try {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client    = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
          const result = await client.messages.create({
            model:      config.model,
            max_tokens: config.max_tokens,
            system:     config.system_prompt,
            messages:   msgs as Array<{ role: 'user' | 'assistant'; content: string }>,
          });
          const block = result.content[0];
          return block?.type === 'text' ? block.text : 'Unable to generate response.';
        } catch {
          // Fallback simulated response for dev/demo
          return buildSimulatedResponse(userText, context);
        }
      },
    });

    const quick_replies = buildQuickReplies(context);

    return NextResponse.json(
      { response, session_id, quick_replies },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

// ── Simulated response for dev/demo ──────────────────────────────────────────

function buildSimulatedResponse(
  question: string,
  context: ReturnType<typeof buildSiteContext>,
): string {
  const q = question.toLowerCase();
  const d = context.domain;

  if (q.includes('fix first') || q.includes('priority')) {
    const top = context.top_issue_types[0] ?? 'schema markup';
    return (
      `Based on ${d}'s current data, I'd prioritize fixing **${top}** issues first. ` +
      `You have ${context.open_issues} open issues, and addressing ${top} typically ` +
      `has the highest impact on both health score and search visibility.`
    );
  }
  if (q.includes('health score') || q.includes('score low')) {
    return (
      `Your health score is currently **${context.health_score}/100**. ` +
      `The main factors pulling it down are: ${context.top_issue_types.slice(0, 2).join(' and ')}. ` +
      `VAEO has already fixed ${context.recent_fixes} issues this month — keep it up!`
    );
  }
  if (q.includes('ranking') || q.includes('drop') || q.includes('position')) {
    const trend = context.ranking_trend;
    return (
      `Your rankings are currently **${trend}**. ` +
      (trend === 'declining'
        ? `The most likely cause is ${context.top_issue_types[0] ?? 'technical SEO issues'}. VAEO is actively addressing this.`
        : `Great news — the fixes VAEO has applied are starting to show positive results.`)
    );
  }
  if (q.includes('fixed') || q.includes('recent') || q.includes('done')) {
    return (
      `VAEO has applied **${context.recent_fixes} fixes** in the last 30 days for ${d}. ` +
      `Recent work includes: ${context.top_issue_types.slice(0, 2).join(', ')} corrections. ` +
      `Your health score is now ${context.health_score}/100, up from where we started.`
    );
  }
  if (q.includes('ai visibility') || q.includes('perplexity') || q.includes('chatgpt')) {
    return (
      `Your AI visibility score is **${context.ai_visibility_score}/100**. ` +
      `To improve citations in AI tools like Perplexity and ChatGPT, ` +
      `I recommend adding FAQ schema and speakable markup to your top pages. ` +
      `VAEO can automate these improvements.`
    );
  }
  // Generic fallback
  return (
    `For ${d}, here's what I can tell you: your health score is ${context.health_score}/100, ` +
    `you have ${context.open_issues} open issues, and your rankings are ${context.ranking_trend}. ` +
    `Ask me about specific issues, your health score, recent fixes, or AI visibility for more detail.`
  );
}
