/**
 * chat.ts
 *
 * Text-based chat API routes for iOS app integration
 */

import express, { Request, Response } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { getPool } from '../db/pool';

const router = express.Router();

const LLM_ROUTER_URL = process.env.LLM_ROUTER_URL || 'http://llm-router:3003';

/**
 * Send a text message and get LLM response
 * POST /api/chat/message
 */
router.post('/message', async (req: Request, res: Response) => {
  try {
    const { message, conversationId, intent } = req.body;
    const userId = (req as any).userId; // Set by auth middleware

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Generate message ID
    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    // Build conversation history if conversationId provided
    let messages: Array<{ role: string; content: string }> = [];

    if (conversationId) {
      // Fetch conversation history from database
      const pool = getPool();
      const historyResult = await pool.query(
        `SELECT role, content FROM conversation_messages
         WHERE conversation_id = $1 AND user_id = $2
         ORDER BY created_at ASC
         LIMIT 20`,
        [conversationId, userId]
      );

      messages = historyResult.rows.map((row) => ({
        role: row.role,
        content: row.content,
      }));
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: message,
    });

    // Call LLM router
    logger.info({ userId, messageId, conversationId }, 'Sending message to LLM');

    const llmResponse = await axios.post(
      `${LLM_ROUTER_URL}/complete`,
      {
        messages,
        intent: intent || 'conversational',
        temperature: 0.7,
        maxTokens: 1000,
      },
      {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    const { content, provider, model, latency, sources } = llmResponse.data;

    // Store messages in database
    const pool = getPool();
    const actualConversationId = conversationId || uuidv4();

    // Create conversation if new
    if (!conversationId) {
      await pool.query(
        `INSERT INTO conversations (id, user_id, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [actualConversationId, userId]
      );
    }

    // Store user message
    await pool.query(
      `INSERT INTO conversation_messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [uuidv4(), actualConversationId, userId, 'user', message]
    );

    // Store assistant message
    const assistantMessageId = uuidv4();
    await pool.query(
      `INSERT INTO conversation_messages (id, conversation_id, user_id, role, content, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [assistantMessageId, actualConversationId, userId, 'assistant', content]
    );

    // Update conversation timestamp
    await pool.query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [actualConversationId]
    );

    // Return response
    res.json({
      messageId: assistantMessageId,
      conversationId: actualConversationId,
      content,
      timestamp,
      metadata: {
        provider,
        model,
        latency,
        sources: sources || [],
      },
    });

    logger.info(
      { userId, messageId, conversationId: actualConversationId, latency },
      'Chat message completed'
    );
  } catch (error: any) {
    logger.error({ error, userId: (req as any).userId }, 'Chat message failed');

    if (axios.isAxiosError(error)) {
      return res.status(503).json({
        error: 'LLM service unavailable',
        message: error.message,
      });
    }

    res.status(500).json({
      error: 'Failed to process message',
      message: error.message,
    });
  }
});

/**
 * Get conversation history
 * GET /api/chat/conversation/:conversationId
 */
router.get('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).userId;

    const pool = getPool();

    // Verify conversation belongs to user
    const convResult = await pool.query(
      `SELECT id, created_at, updated_at FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Fetch messages
    const messagesResult = await pool.query(
      `SELECT id, role, content, created_at
       FROM conversation_messages
       WHERE conversation_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [conversationId, userId]
    );

    res.json({
      conversationId,
      messages: messagesResult.rows.map((row) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        timestamp: row.created_at,
      })),
      createdAt: convResult.rows[0].created_at,
      updatedAt: convResult.rows[0].updated_at,
    });
  } catch (error: any) {
    logger.error({ error, conversationId: req.params.conversationId }, 'Failed to fetch conversation');
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

/**
 * List all conversations for user
 * GET /api/chat/conversations
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const pool = getPool();

    const result = await pool.query(
      `SELECT c.id, c.created_at, c.updated_at,
              (SELECT content FROM conversation_messages
               WHERE conversation_id = c.id
               ORDER BY created_at DESC LIMIT 1) as last_message
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.updated_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      conversations: result.rows.map((row) => ({
        id: row.id,
        lastMessage: row.last_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to list conversations');
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * Delete a conversation
 * DELETE /api/chat/conversation/:conversationId
 */
router.delete('/conversation/:conversationId', async (req: Request, res: Response) => {
  try {
    const { conversationId } = req.params;
    const userId = (req as any).userId;
    const pool = getPool();

    // Delete messages first (due to foreign key)
    await pool.query(
      `DELETE FROM conversation_messages WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );

    // Delete conversation
    const result = await pool.query(
      `DELETE FROM conversations WHERE id = $1 AND user_id = $2 RETURNING id`,
      [conversationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true, conversationId });
  } catch (error: any) {
    logger.error({ error, conversationId: req.params.conversationId }, 'Failed to delete conversation');
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

export default router;
