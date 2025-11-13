/**
 * RAG Service client for retrieving grounded context
 */

import axios from 'axios';
import { RetrievalContext, RetrievedDocument } from './types';

export class RAGClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.RAG_SERVICE_URL || 'http://rag-service:3002';
  }

  /**
   * Retrieve relevant documents for a query
   */
  async retrieve(query: string, limit: number = 5): Promise<RetrievalContext> {
    try {
      const response = await axios.post(`${this.baseUrl}/search`, {
        query,
        limit,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      });

      const data: any = response.data;

      // Transform RAG service response to RetrievalContext
      const documents: RetrievedDocument[] = (data.results || []).map((result: any) => ({
        content: result.chunkText || result.chunk_text || result.content || '',
        source: result.sourceUrl || result.source_url || result.source || 'Unknown',
        relevance: result.similarity || result.relevance || 0,
        metadata: result.metadata || {},
      }));

      return {
        documents,
        query,
      };
    } catch (error: any) {
      console.error('[RAGClient] Retrieval error:', error);

      // Return empty context on error
      return {
        documents: [],
        query,
      };
    }
  }

  /**
   * Health check for RAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/healthz`, {
        timeout: 5000, // 5 second timeout
      });

      return response.status === 200;
    } catch (error) {
      console.error('[RAGClient] Health check failed:', error);
      return false;
    }
  }
}
