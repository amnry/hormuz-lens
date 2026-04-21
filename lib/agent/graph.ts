import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode }                                    from '@langchain/langgraph/prebuilt';
import { ChatOpenAI }                                  from '@langchain/openai';
import { AIMessage, SystemMessage }                    from '@langchain/core/messages';
import { agentTools }                                  from './tools';
import { SYSTEM_PROMPT }                               from './system-prompt';

// ── Model factories ───────────────────────────────────────────────────────────
// Lazy: env is read at call time, not import time. bindTools is also deferred
// so no OpenAI/LangChain objects are constructed during module evaluation.

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

function getPrimaryModel() {
  return new ChatOpenAI({
    modelName:     'anthropic/claude-haiku-4-5',
    apiKey:        process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: OPENROUTER_BASE },
    maxTokens:     4096,
    maxRetries:    0,
    temperature:   0,
  });
}

function getFallbackModel() {
  return new ChatOpenAI({
    modelName:     'anthropic/claude-haiku-4-5',
    apiKey:        process.env.OPENROUTER_API_KEY,
    configuration: { baseURL: OPENROUTER_BASE },
    maxTokens:     4096,
    maxRetries:    1,
    temperature:   0,
  });
}

// ── Routing ───────────────────────────────────────────────────────────────────

function routeAfterAgent(state: typeof MessagesAnnotation.State): 'tools' | typeof END {
  const last = state.messages.at(-1);
  if (last instanceof AIMessage && last.tool_calls && last.tool_calls.length > 0) {
    return 'tools';
  }
  return END;
}

// ── Nodes ─────────────────────────────────────────────────────────────────────

async function agentNode(state: typeof MessagesAnnotation.State) {
  const messages =
    state.messages[0]?.getType() === 'system'
      ? state.messages
      : [new SystemMessage(SYSTEM_PROMPT), ...state.messages];

  try {
    const response = await getPrimaryModel().bindTools(agentTools).invoke(messages);
    return { messages: [response] };
  } catch (err: unknown) {
    const status =
      (err as { status?: number }).status ??
      (err as { error?: { code?: number } }).error?.code;
    if (status === 429 || status === 500 || status === 503) {
      const response = await getFallbackModel().bindTools(agentTools).invoke(messages);
      return { messages: [response] };
    }
    throw err;
  }
}

// ToolNode reads AIMessage.tool_calls, executes each tool, and returns ToolMessages
// with tool_call_id matching the originating call. addMessages deduplicates by id.
const toolNode = new ToolNode(agentTools);

// ── Graph ─────────────────────────────────────────────────────────────────────

const graph = new StateGraph(MessagesAnnotation)
  .addNode('agent', agentNode)
  .addNode('tools', toolNode)
  .addEdge(START, 'agent')
  .addConditionalEdges('agent', routeAfterAgent)
  .addEdge('tools', 'agent')
  .compile();

// recursionLimit: 10 passed via RunnableConfig at invoke/stream time in route.ts.
export const MAX_RECURSION = 10;
export { graph };
