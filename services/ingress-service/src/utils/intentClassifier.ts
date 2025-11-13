/**
 * LLM-based intent classification
 * Uses a lightweight LLM to determine if a query needs RAG (critical) or can be answered conversationally
 */

import axios from 'axios';
import { logger } from './logger';

const LLM_ROUTER_URL = process.env.LLM_ROUTER_URL || 'http://llm-router:3003';

// Simple in-memory cache to avoid repeated LLM calls for similar queries
const intentCache = new Map<string, { intent: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Classify intent using LLM
 */
export async function classifyIntentWithLLM(query: string): Promise<'critical' | 'conversational'> {
  logger.info({ query }, 'classifyIntentWithLLM called');

  // Check cache first
  const cacheKey = query.toLowerCase().trim();
  const cached = intentCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.info({ query: query.substring(0, 50), intent: cached.intent }, 'Intent from cache');
    return cached.intent as 'critical' | 'conversational';
  }

  try {
    logger.info({ url: LLM_ROUTER_URL }, 'Calling LLM for intent classification');

    // Call LLM with classification prompt
    const response = await axios.post(
      `${LLM_ROUTER_URL}/complete`,
      {
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier. Classify the user's query as either "critical" or "conversational".

CRITICAL queries:
- Questions about technical documentation, APIs, systems, features
- "What is X?", "How does Y work?", "Explain Z"
- Requests for specific information from documentation
- Technical how-to questions

CONVERSATIONAL queries:
- Greetings, farewells, small talk
- Entertainment requests (jokes, stories)
- General questions not requiring specific documentation
- Casual conversation, opinions, preferences

Respond with ONLY the word "critical" or "conversational", nothing else.`,
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: 0.1, // Low temperature for consistent classification
        maxTokens: 10,
        intent: 'conversational', // Don't trigger RAG for the classification itself!
      },
      {
        timeout: 3000, // Fast timeout
      }
    );

    logger.info({ responseData: response.data }, 'Raw LLM response for intent classification');

    const classification = response.data.content.toLowerCase().trim();
    const intent = classification.includes('critical') ? 'critical' : 'conversational';

    logger.info({ query: query.substring(0, 50), classification, intent }, 'Parsed classification result');

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

    logger.info({ query: query.substring(0, 50), intent, classification }, 'Intent from LLM');
    return intent;
  } catch (error) {
    logger.error({ error, query: query.substring(0, 50) }, 'Intent classification failed, defaulting to conversational');
    // On error, default to conversational to avoid blocking
    return 'conversational';
  }
}
