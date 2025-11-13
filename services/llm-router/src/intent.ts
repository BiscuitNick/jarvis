/**
 * Intent-based prompt engineering for RAG integration
 */

import { IntentType, Message, RetrievalContext } from './types';
import { ProviderManager } from './ProviderManager';

// Simple in-memory cache to avoid repeated LLM calls
const intentCache = new Map<string, { intent: IntentType; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let providerManager: ProviderManager;

export function initializeIntentClassifier(manager: ProviderManager) {
  providerManager = manager;
}

/**
 * Classify intent using LLM
 */
export async function classifyIntent(query: string): Promise<IntentType> {
  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = intentCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.intent;
  }

  try {
    // Call LLM with classification prompt
    const response = await providerManager.complete({
      messages: [
        {
          role: 'system',
          content: `You are an intent classifier. Classify the user's query as either "critical" or "casual".

CRITICAL queries:
- Questions about technical documentation, APIs, systems, features
- "What is X?", "How does Y work?", "Explain Z"
- Requests for specific information from documentation
- Technical how-to questions

CASUAL queries:
- Greetings, farewells, small talk
- Entertainment requests (jokes, stories)
- General questions not requiring specific documentation
- Casual conversation, opinions, preferences

Respond with ONLY the word "critical" or "casual", nothing else.`,
        },
        {
          role: 'user',
          content: query,
        },
      ],
      temperature: 0.1,
      maxTokens: 10,
      stream: false,
      intent: IntentType.CASUAL, // Don't trigger RAG for classification itself
    });

    const classification = response.content.toLowerCase().trim();
    const intent = classification.includes('critical') ? IntentType.CRITICAL : IntentType.CASUAL;

    // Cache the result
    intentCache.set(cacheKey, { intent, timestamp: Date.now() });

    // Cleanup old cache entries periodically
    if (intentCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of intentCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
          intentCache.delete(key);
        }
      }
    }

    return intent;
  } catch (error) {
    console.error('[Intent] Classification failed, defaulting to casual:', error);
    return IntentType.CASUAL;
  }
}

/**
 * Build system prompt based on intent type
 */
export function buildSystemPrompt(intent: IntentType, context?: RetrievalContext): string {
  if (intent === IntentType.CRITICAL) {
    return buildCriticalSystemPrompt(context);
  } else {
    return buildCasualSystemPrompt();
  }
}

/**
 * Build critical intent system prompt (retrieval-only)
 */
function buildCriticalSystemPrompt(context?: RetrievalContext): string {
  let prompt = `You are Jarvis, an AI assistant with access to a knowledge base. You must ONLY answer questions using information from the provided context.

CRITICAL RULES:
1. ONLY use information from the provided context documents
2. If the context doesn't contain the answer, say "I don't have that information in my knowledge base"
3. DO NOT make up information or use knowledge outside the provided context
4. Be concise and direct in your responses
5. Do not mention sources or citations in your response
`;

  if (context && context.documents.length > 0) {
    prompt += '\n\nCONTEXT DOCUMENTS:\n';
    context.documents.forEach((doc, index) => {
      prompt += `\n[Document ${index + 1}: ${doc.source}]\n${doc.content}\n`;
    });

    prompt += '\n\nRemember: Only use information from these documents.';
  } else {
    prompt += '\n\nNo context documents are available. You must inform the user that you cannot answer without access to relevant information.';
  }

  return prompt;
}

/**
 * Build casual intent system prompt
 */
function buildCasualSystemPrompt(): string {
  return `You are Jarvis, a friendly and helpful AI assistant. You can engage in casual conversation and answer general questions.

You should be:
- Friendly and conversational
- Concise but helpful
- Natural and engaging

For simple greetings and casual interactions, respond naturally without requiring context documents.`;
}

/**
 * Inject citations into a response
 * NOTE: Disabled - citations are now only shown in the expandable sources section
 */
export function injectCitations(response: string, context?: RetrievalContext): string {
  // No longer inject citations into the response text
  // Citations are handled separately in the sources metadata
  return response;
}

/**
 * Validate that a response is grounded in the provided context
 */
export function validateGrounding(
  response: string,
  context?: RetrievalContext
): { isGrounded: boolean; confidence: number } {
  if (!context || context.documents.length === 0) {
    // No context means we can't validate grounding
    return { isGrounded: false, confidence: 0 };
  }

  // Simple heuristic: check if response contains phrases from context
  const contextText = context.documents.map((d) => d.content.toLowerCase()).join(' ');
  const responseLower = response.toLowerCase();

  // Extract significant phrases from response (3+ words)
  const phrases = responseLower.match(/\b\w+\s+\w+\s+\w+\b/g) || [];

  if (phrases.length === 0) {
    return { isGrounded: true, confidence: 0.5 }; // Short responses are hard to validate
  }

  // Check how many phrases appear in context
  let matchedPhrases = 0;
  for (const phrase of phrases) {
    if (contextText.includes(phrase)) {
      matchedPhrases++;
    }
  }

  const confidence = matchedPhrases / phrases.length;
  const isGrounded = confidence > 0.3; // 30% threshold

  return { isGrounded, confidence };
}
