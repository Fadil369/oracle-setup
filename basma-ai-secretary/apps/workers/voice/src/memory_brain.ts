export class MemoryBrain {
  constructor(private env: any) {}

  /**
   * Encodes a textual memory into a high-dimensional vector and stores it in Cloudflare Vectorize
   * alongside relational SQL identifiers for RAG (Retrieval-Augmented Generation).
   */
  async encodeAndStore(params: {
    visitorId: string;
    callId: string;
    summary: string;
    sentiment?: string;
    language?: string;
  }) {
    if (!this.env.AI || !this.env.BASMA_MEMORY_VECTOR) {
      console.warn("MemoryBrain is disabled: Missing Cloudflare AI or Vectorize bindings.");
      return;
    }

    try {
      // 1. Generate local Edge AI Embedding
      const embeddingResponse = await this.env.AI.run('@cf/baai/bge-small-en-v1.5', {
        text: [params.summary]
      });

      // 2. Structurally store in Vectorize
      const vectorId = crypto.randomUUID();
      await this.env.BASMA_MEMORY_VECTOR.upsert([{
        id: vectorId,
        values: embeddingResponse.data[0],
        metadata: {
          visitor_id: params.visitorId,
          call_id: params.callId,
          timestamp: Date.now(),
          sentiment: params.sentiment || 'neutral',
          language: params.language || 'mixed'
        }
      }]);

      console.log(`🧠 MemoryBrain encoded and secured episodic memory: ${vectorId}`);
      return vectorId;
    } catch (e) {
      console.error("Failed to commit to MemoryBrain:", e);
    }
  }

  /**
   * Semantically searches a patient's/partner's past historical data and transcripts
   * to provide Basma with hyper-contextual awareness for the incoming query.
   */
  async retrieveContext(visitorId: string, currentQuery: string, limit = 5) {
    if (!this.env.AI || !this.env.BASMA_MEMORY_VECTOR) {
      return [];
    }

    try {
      // 1. Generate semantic intent of the current interaction
      const embeddingResponse = await this.env.AI.run('@cf/baai/bge-small-en-v1.5', {
        text: [currentQuery]
      });

      // 2. Query the exact historical semantic matches for THIS specific caller
      const searchResults = await this.env.BASMA_MEMORY_VECTOR.query(embeddingResponse.data[0], {
        topK: limit,
        // Vectorize supports metadata filtering to strictly partition memory brains
        filter: { visitor_id: visitorId }
      });

      // 3. For a production RAG system, we map the vector matches back to D1 text
      // Here we just return the closest structured matching IDs to weave into the Anthropic prompt.
      return searchResults.matches.map((m: any) => ({
        score: m.score,
        callId: m.metadata.call_id,
        historicalTimestamp: m.metadata.timestamp,
        sentiment: m.metadata.sentiment
      }));
    } catch (e) {
      console.error("Failed MemoryBrain retrieval:", e);
      return [];
    }
  }
}
