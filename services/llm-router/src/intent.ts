/**
 * Intent classification and prompt engineering
 */

import { IntentType, Message, RetrievalContext } from './types';

/**
 * Critical intent keywords that require retrieval-only responses
 */
const CRITICAL_KEYWORDS = [
  'how',
  'what',
  'explain',
  'describe',
  'tell me about',
  'information about',
  'details about',
  'show me',
  'find',
  'search',
  'lookup',
  'documentation',
  'docs',
  'api',
  'function',
  'method',
  'class',
  'code',
  'implementation',
  'example',
  'tutorial',
  'guide',
];

/**
 * Classify the intent of a user query
 */
export function classifyIntent(query: string): IntentType {
  const lowerQuery = query.toLowerCase();

  // Check for critical keywords
  for (const keyword of CRITICAL_KEYWORDS) {
    if (lowerQuery.includes(keyword)) {
      return IntentType.CRITICAL;
    }
  }

  // Check for question patterns
  const questionPatterns = [/^(what|how|why|when|where|who|which)\s/i, /\?$/];

  for (const pattern of questionPatterns) {
    if (pattern.test(query)) {
      return IntentType.CRITICAL;
    }
  }

  // Default to casual for greetings and simple interactions
  const casualPatterns = [
    /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure)\s*[!.]?$/i,
  ];

  for (const pattern of casualPatterns) {
    if (pattern.test(query.trim())) {
      return IntentType.CASUAL;
    }
  }

  // Default to critical to be safe
  return IntentType.CRITICAL;
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
3. ALWAYS cite your sources by mentioning the document name or URL
4. DO NOT make up information or use knowledge outside the provided context
5. Be concise and direct in your responses
`;

  if (context && context.documents.length > 0) {
    prompt += '\n\nCONTEXT DOCUMENTS:\n';
    context.documents.forEach((doc, index) => {
      prompt += `\n[Document ${index + 1}: ${doc.source}]\n${doc.content}\n`;
    });

    prompt += '\n\nRemember: Only use information from these documents and cite your sources.';
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
 */
export function injectCitations(response: string, context?: RetrievalContext): string {
  if (!context || context.documents.length === 0) {
    return response;
  }

  // Build citations list
  const citations = context.documents
    .filter((doc) => doc.relevance > 0.5) // Only include relevant docs
    .map((doc, index) => `[${index + 1}] ${doc.source}`)
    .join('\n');

  if (citations) {
    return `${response}\n\nSources:\n${citations}`;
  }

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
