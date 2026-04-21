import { z }                                      from 'zod';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { createDataStreamResponse, formatDataStreamPart } from 'ai';
import { graph, MAX_RECURSION }                   from '@/lib/agent/graph';

export const runtime = 'nodejs';

const MessageSchema = z.object({
  role:    z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1),
});

function toLangChain(msgs: z.infer<typeof MessageSchema>[]) {
  return msgs.map(m => {
    if (m.role === 'user')      return new HumanMessage(m.content);
    if (m.role === 'assistant') return new AIMessage(m.content);
    return new SystemMessage(m.content);
  });
}

// Handles AIMessageChunk.content being a plain string or an array of content
// blocks (e.g. {type:'text', text:'...'}) as returned by some providers.
function extractText(chunk: unknown): string {
  if (chunk === null || typeof chunk !== 'object') return '';
  const content = (chunk as Record<string, unknown>)['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (p): p is { type: 'text'; text: string } =>
        typeof p === 'object' &&
        p !== null &&
        (p as Record<string, unknown>)['type'] === 'text' &&
        typeof (p as Record<string, unknown>)['text'] === 'string',
    )
    .map(p => p.text)
    .join('');
}

export async function POST(req: Request) {
  const body   = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body', details: parsed.error.flatten() }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const messages = toLangChain(parsed.data.messages);

  return createDataStreamResponse({
    execute: async (writer) => {
      // Gate: only stream text tokens during the final synthesis turn.
      // toolsHaveRun flips true on first on_tool_end.
      // anyToolStarted flips true on first on_tool_start.
      // Forward text when: at least one tool has finished (synthesis turn)
      // OR no tool was ever called (direct-answer path — stream freely).
      let anyToolStarted = false;
      let toolsHaveRun   = false;

      const eventStream = graph.streamEvents(
        { messages },
        { version: 'v2', recursionLimit: MAX_RECURSION },
      );

      for await (const event of eventStream) {
        if (event.event === 'on_chat_model_stream') {
          if (toolsHaveRun || !anyToolStarted) {
            const text = extractText(event.data['chunk']);
            if (text) writer.write(formatDataStreamPart('text', text));
          }

        } else if (event.event === 'on_tool_start') {
          anyToolStarted = true;
          const input        = event.data['input'];
          const inputSummary = JSON.stringify(input).slice(0, 200);
          writer.writeMessageAnnotation({ type: 'tool_start', name: event.name, input_summary: inputSummary });

        } else if (event.event === 'on_tool_end') {
          toolsHaveRun = true;
          writer.writeMessageAnnotation({ type: 'tool_end', name: event.name });
        }
      }
    },
    onError: (err) => {
      console.error('[chat/route] stream error:', err);
      return (err as Error).message ?? 'Internal server error';
    },
  });
}
