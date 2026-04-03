/**
 * BrainSAIT Portals - RAG Search Integration
 * Cloudflare Worker with R2 + AI Gateway for HNH Healthcare Data
 * 
 * Features:
 * - AI-powered semantic search via Cloudflare AI Gateway
 * - R2 bucket storage for processed documents
 * - KV cache for search results
 * - Integration with oracle-setup portals
 */

// ── RAG Search Handler ──────────────────────────────────────────────────────

const CF_AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/d7b99530559ab4f2545e9bdc72a7ab9b/default/compat/chat/completions";
const R2_BUCKET_URL = "https://d7b99530559ab4f2545e9bdc72a7ab9b.r2.cloudflarestorage.com/brainsait-documents";

// HNH Healthcare Data Index (loaded from R2)
let RAG_INDEX = null;

/**
 * Load RAG index from R2 bucket
 */
async function loadRAGIndex(env) {
  if (RAG_INDEX) return RAG_INDEX;
  
  try {
    // Try to get from R2
    const object = await env.DOCUMENTS.get('hnh_processed/rag_index.json');
    
    if (object) {
      const data = await object.text();
      RAG_INDEX = JSON.parse(data);
      console.log(`✓ Loaded RAG index: ${RAG_INDEX.length} records`);
      return RAG_INDEX;
    }
    
    // Fallback: Return empty array
    console.warn('⚠ RAG index not found in R2');
    RAG_INDEX = [];
    return RAG_INDEX;
  } catch (error) {
    console.error('Error loading RAG index:', error);
    RAG_INDEX = [];
    return RAG_INDEX;
  }
}

/**
 * Prepare context summary for AI
 */
function prepareContext(index, maxRecords = 30) {
  const summary = {};
  
  for (const record of index.slice(0, maxRecords)) {
    const key = `${record.company}_${record.region}_${record.year}`;
    if (!summary[key]) {
      summary[key] = {
        company: record.company,
        region: record.region,
        year: record.year,
        total_claims: 0,
        files: 0
      };
    }
    summary[key].total_claims += record.claim_count || 0;
    summary[key].files += 1;
  }
  
  return Object.values(summary)
    .map(d => `- ${d.company} in ${d.region} (${d.year}): ${d.total_claims.toLocaleString()} claims`)
    .join('\n');
}

/**
 * Search with AI via Cloudflare Gateway
 */
async function searchWithAI(query, index, env) {
  const context = prepareContext(index);
  
  const prompt = `You are a healthcare data analyst for BrainSAIT. Help search and analyze HNH insurance claims data.

Available Data:
${context}

User Query: ${query}

Provide a clear, structured analysis with:
1. Direct answer to the query
2. Relevant data points
3. Key insights
4. Actionable recommendations

Keep response concise and professional.`;

  try {
    const response = await fetch(CF_AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a healthcare data analyst. Provide accurate, actionable insights from insurance claims data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const result = await response.json();
    return {
      success: true,
      analysis: result.choices[0].message.content,
      model: 'gpt-4o-mini',
      cached: response.headers.get('cf-cache-status') === 'HIT'
    };
  } catch (error) {
    console.error('AI search error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Keyword search fallback
 */
function searchLocal(query, index) {
  const terms = query.toLowerCase().split(/\s+/);
  const results = [];
  
  for (const record of index) {
    const searchable = [
      record.company,
      record.region,
      record.year,
      record.searchable_text || ''
    ].join(' ').toLowerCase();
    
    const matches = terms.filter(term => searchable.includes(term)).length;
    if (matches > 0) {
      results.push({
        ...record,
        relevance: matches / terms.length
      });
    }
  }
  
  // Sort by relevance
  return results.sort((a, b) => b.relevance - a.relevance);
}

/**
 * Get statistics
 */
function getStatistics(index) {
  const stats = {
    total_records: index.length,
    total_claims: 0,
    by_company: {},
    by_region: {},
    by_year: {}
  };
  
  for (const record of index) {
    stats.total_claims += record.claim_count || 0;
    
    const company = record.company || 'Unknown';
    const region = record.region || 'Unknown';
    const year = record.year || 'Unknown';
    
    stats.by_company[company] = (stats.by_company[company] || 0) + (record.claim_count || 0);
    stats.by_region[region] = (stats.by_region[region] || 0) + (record.claim_count || 0);
    stats.by_year[year] = (stats.by_year[year] || 0) + (record.claim_count || 0);
  }
  
  // Top 10 by volume
  stats.top_companies = Object.entries(stats.by_company)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, claims: count }));
    
  stats.top_regions = Object.entries(stats.by_region)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, claims: count }));
  
  return stats;
}

// ── Main Request Handler ────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ── Health Check ────────────────────────────────────────────────────
      if (path === '/health' || path === '/') {
        return new Response(JSON.stringify({
          status: 'healthy',
          service: 'BrainSAIT Portals RAG Search',
          version: '1.0.0',
          endpoints: {
            search: '/api/search',
            stats: '/api/stats',
            upload: '/api/upload'
          }
        }), { headers: corsHeaders });
      }

      // ── RAG Search ─────────────────────────────────────────────────────
      if (path === '/api/search' && request.method === 'POST') {
        const { query, use_ai = true } = await request.json();
        
        if (!query) {
          return new Response(JSON.stringify({
            error: 'Query is required'
          }), { status: 400, headers: corsHeaders });
        }

        // Load index
        const index = await loadRAGIndex(env);
        
        if (index.length === 0) {
          return new Response(JSON.stringify({
            error: 'RAG index not loaded. Please upload data first.',
            hint: 'POST /api/upload with rag_index.json'
          }), { status: 503, headers: corsHeaders });
        }

        // Check cache first
        const cacheKey = `search:${query}`;
        const cached = await env.SEARCH_CACHE?.get(cacheKey);
        
        if (cached) {
          const result = JSON.parse(cached);
          result.cached = true;
          return new Response(JSON.stringify(result), { headers: corsHeaders });
        }

        let result;
        
        if (use_ai && env.OPENAI_API_KEY) {
          // AI-powered search
          const aiResult = await searchWithAI(query, index, env);
          
          if (aiResult.success) {
            result = {
              query,
              ai_analysis: aiResult.analysis,
              model: aiResult.model,
              timestamp: new Date().toISOString(),
              cached: false
            };
          } else {
            // Fallback to keyword search
            const localResults = searchLocal(query, index);
            result = {
              query,
              results: localResults.slice(0, 10),
              fallback: true,
              error: aiResult.error,
              timestamp: new Date().toISOString()
            };
          }
        } else {
          // Keyword search
          const localResults = searchLocal(query, index);
          result = {
            query,
            results: localResults.slice(0, 10),
            mode: 'keyword',
            timestamp: new Date().toISOString()
          };
        }

        // Cache for 1 hour
        await env.SEARCH_CACHE?.put(cacheKey, JSON.stringify(result), {
          expirationTtl: 3600
        });

        return new Response(JSON.stringify(result), { headers: corsHeaders });
      }

      // ── Statistics ──────────────────────────────────────────────────────
      if (path === '/api/stats' && request.method === 'GET') {
        const index = await loadRAGIndex(env);
        
        if (index.length === 0) {
          return new Response(JSON.stringify({
            error: 'No data available'
          }), { status: 404, headers: corsHeaders });
        }

        const stats = getStatistics(index);
        
        return new Response(JSON.stringify({
          ...stats,
          timestamp: new Date().toISOString()
        }), { headers: corsHeaders });
      }

      // ── Upload RAG Index ────────────────────────────────────────────────
      if (path === '/api/upload' && request.method === 'POST') {
        // Check authorization
        const authHeader = request.headers.get('Authorization');
        const apiKey = env.API_KEY;
        
        if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
          return new Response(JSON.stringify({
            error: 'Unauthorized'
          }), { status: 401, headers: corsHeaders });
        }

        const { filename, content } = await request.json();
        
        if (!filename || !content) {
          return new Response(JSON.stringify({
            error: 'filename and content are required'
          }), { status: 400, headers: corsHeaders });
        }

        // Store in R2
        await env.DOCUMENTS.put(filename, JSON.stringify(content), {
          httpMetadata: {
            contentType: 'application/json'
          }
        });

        // Invalidate cache
        RAG_INDEX = null;

        return new Response(JSON.stringify({
          success: true,
          message: `Uploaded ${filename}`,
          size: JSON.stringify(content).length
        }), { headers: corsHeaders });
      }

      // ── 404 Not Found ───────────────────────────────────────────────────
      return new Response(JSON.stringify({
        error: 'Not Found',
        path
      }), { status: 404, headers: corsHeaders });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        error: 'Internal Server Error',
        message: error.message
      }), { status: 500, headers: corsHeaders });
    }
  }
};
