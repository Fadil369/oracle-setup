# BrainSAIT Portals RAG Integration - Deployment Guide

**Repository:** https://github.com/Fadil369/oracle-setup.git  
**Worker URL:** https://brainsait-portals.elfadil.com  
**R2 Bucket:** brainsait-documents  
**AI Gateway:** gateway.ai.cloudflare.com/v1/d7b99530559ab4f2545e9bdc72a7ab9b/default/compat

---

## Quick Start

### 1. Deploy Worker

```bash
cd /Users/fadil369/oracle-setup

# Deploy BrainSAIT portals worker
wrangler deploy --config wrangler.brainsait.toml
```

### 2. Create KV Namespace

```bash
# Create search cache namespace
wrangler kv namespace create "SEARCH_CACHE" --config wrangler.brainsait.toml

# Copy the namespace ID and update wrangler.brainsait.toml
```

### 3. Set Secrets

```bash
# OpenAI API key for AI Gateway
wrangler secret put OPENAI_API_KEY --config wrangler.brainsait.toml

# API key for upload endpoint (choose a strong random string)
wrangler secret put API_KEY --config wrangler.brainsait.toml

# Save the API key for uploads
export BRAINSAIT_API_KEY="your-api-key-here"
```

### 4. Upload HNH Data

```bash
# Upload processed RAG index to R2
./upload_to_r2.sh
```

### 5. Test Deployment

```bash
# Health check
curl https://brainsait-portals.elfadil.com/health | jq

# Get statistics
curl https://brainsait-portals.elfadil.com/api/stats | jq

# Test search
curl -X POST https://brainsait-portals.elfadil.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "Show BUPA claims in Riyadh 2025"}' | jq
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  User / Client Application                              │
└────────────────┬────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│  Cloudflare Worker (brainsait-portals.elfadil.com)      │
│  ├─ /api/search   - AI-powered semantic search          │
│  ├─ /api/stats    - Dataset statistics                  │
│  └─ /api/upload   - Upload RAG index                    │
└───┬──────────────────────┬──────────────────────────────┘
    │                      │
    ▼                      ▼
┌─────────────┐    ┌──────────────────────────────────┐
│  R2 Bucket  │    │  Cloudflare AI Gateway           │
│  brainsait- │    │  (with caching & rate limiting)  │
│  documents  │    └──────────┬───────────────────────┘
└─────────────┘               │
                              ▼
                      ┌────────────────┐
                      │  OpenAI API    │
                      │  (gpt-4o-mini) │
                      └────────────────┘
```

---

## API Endpoints

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "BrainSAIT Portals RAG Search",
  "version": "1.0.0",
  "endpoints": {
    "search": "/api/search",
    "stats": "/api/stats",
    "upload": "/api/upload"
  }
}
```

### POST /api/search

Semantic search over HNH healthcare data.

**Request:**
```json
{
  "query": "Show BUPA claims trends in Riyadh 2025",
  "use_ai": true  // Optional, default: true
}
```

**Response (AI mode):**
```json
{
  "query": "Show BUPA claims trends in Riyadh 2025",
  "ai_analysis": "Based on the data, BUPA Arabia shows...",
  "model": "gpt-4o-mini",
  "cached": false,
  "timestamp": "2026-03-27T20:00:00Z"
}
```

**Response (Keyword mode):**
```json
{
  "query": "BUPA Riyadh",
  "results": [
    {
      "id": "record-hash",
      "company": "BUPA",
      "region": "Riyadh",
      "year": "2025",
      "claim_count": 37090,
      "relevance": 1.0
    }
  ],
  "mode": "keyword",
  "timestamp": "2026-03-27T20:00:00Z"
}
```

### GET /api/stats

Get dataset statistics.

**Response:**
```json
{
  "total_records": 69,
  "total_claims": 3601322,
  "top_companies": [
    {"name": "BUPA", "claims": 1114820},
    {"name": "TAWUNIYA", "claims": 964096}
  ],
  "top_regions": [
    {"name": "Khamis", "claims": 1088509},
    {"name": "Jizan", "claims": 818634}
  ],
  "timestamp": "2026-03-27T20:00:00Z"
}
```

### POST /api/upload

Upload RAG index or metadata to R2.

**Headers:**
```
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

**Request:**
```json
{
  "filename": "hnh_processed/rag_index.json",
  "content": [...array of records...]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Uploaded hnh_processed/rag_index.json",
  "size": 125678
}
```

---

## Usage Examples

### JavaScript / Fetch

```javascript
// Search for data
const response = await fetch('https://brainsait-portals.elfadil.com/api/search', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: 'Compare TAWUNIYA vs MEDGULF claim volumes'
  })
});

const result = await response.json();
console.log(result.ai_analysis);
```

### Python

```python
import requests

# AI-powered search
response = requests.post(
    'https://brainsait-portals.elfadil.com/api/search',
    json={
        'query': 'Which insurance company has highest claims in Madinah'
    }
)

data = response.json()
print(data['ai_analysis'])
```

### curl

```bash
# AI search
curl -X POST https://brainsait-portals.elfadil.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "Analyze regional healthcare utilization patterns"
  }' | jq

# Keyword search (no AI)
curl -X POST https://brainsait-portals.elfadil.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "BUPA Riyadh",
    "use_ai": false
  }' | jq

# Get statistics
curl https://brainsait-portals.elfadil.com/api/stats | jq
```

---

## Integration with Oracle Portals

### Add Search to Portal UI

```javascript
// In your portal UI
async function searchHealthcareData(query) {
  const response = await fetch('https://brainsait-portals.elfadil.com/api/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  
  return await response.json();
}

// Example usage
const result = await searchHealthcareData('Show claims for this patient ID');
displayResults(result.ai_analysis);
```

### Embed in HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>BrainSAIT Healthcare Search</title>
</head>
<body>
  <h1>Healthcare Data Search</h1>
  
  <input type="text" id="searchQuery" placeholder="Ask about claims data...">
  <button onclick="search()">Search</button>
  
  <div id="results"></div>
  
  <script>
    async function search() {
      const query = document.getElementById('searchQuery').value;
      const response = await fetch('https://brainsait-portals.elfadil.com/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      const data = await response.json();
      document.getElementById('results').innerHTML = `
        <h2>Analysis:</h2>
        <pre>${data.ai_analysis}</pre>
      `;
    }
  </script>
</body>
</html>
```

---

## Cloudflare AI Gateway Benefits

### 1. Caching
- Repeated queries are cached
- First query: ~2-3 seconds
- Cached queries: <0.5 seconds
- Reduces API costs by 70-90%

### 2. Rate Limiting
- Protects against API abuse
- Configurable limits per user/IP
- Automatic backoff

### 3. Analytics
View in Cloudflare Dashboard:
- Total requests
- Cache hit rate
- Average response time
- Cost per request
- Error rates

### 4. Failover
- Automatic retry on errors
- Fallback to keyword search if AI fails
- High availability

---

## Data Management

### Update RAG Index

When you have new data:

```bash
# 1. Process new data
cd /Volumes/NetworkShare/ContentPipeline
source venv/bin/activate
python process_hnh_data.py

# 2. Upload to R2
cd /Users/fadil369/oracle-setup
./upload_to_r2.sh
```

### Clear Cache

```bash
# Clear all search cache
wrangler kv:key list --binding=SEARCH_CACHE --config wrangler.brainsait.toml | \
  jq -r '.[].name' | \
  xargs -I {} wrangler kv:key delete {} --binding=SEARCH_CACHE --config wrangler.brainsait.toml
```

### Backup R2 Data

```bash
# Download from R2
wrangler r2 object get brainsait-documents/hnh_processed/rag_index.json \
  --file backup_rag_index.json \
  --config wrangler.brainsait.toml
```

---

## Monitoring & Debugging

### View Logs

```bash
# Tail worker logs in real-time
wrangler tail --config wrangler.brainsait.toml

# Filter for errors
wrangler tail --config wrangler.brainsait.toml | grep ERROR
```

### Check AI Gateway Metrics

1. Go to https://dash.cloudflare.com/
2. Navigate to AI Gateway
3. Select gateway: `default`
4. View analytics:
   - Request count
   - Cache performance
   - Cost tracking
   - Error rates

### Test Health

```bash
# Quick health check
curl https://brainsait-portals.elfadil.com/health

# Check if data is loaded
curl https://brainsait-portals.elfadil.com/api/stats | jq '.total_records'
```

---

## Troubleshooting

### Error: "RAG index not loaded"

**Solution:** Upload data
```bash
./upload_to_r2.sh
```

### Error: "Unauthorized" on /api/upload

**Solution:** Check API_KEY
```bash
wrangler secret put API_KEY --config wrangler.brainsait.toml
```

### Slow AI Responses

**Possible Causes:**
- First-time query (cache warming)
- Complex query requiring more tokens
- OpenAI API slowdown

**Solution:** Enable caching, responses will be faster on subsequent requests

### No AI Analysis

**Solution:** Check OpenAI API key
```bash
wrangler secret put OPENAI_API_KEY --config wrangler.brainsait.toml
```

Fallback to keyword search automatically if AI fails.

---

## Security

### API Key Management

1. **Upload Endpoint Protection**
   ```bash
   # Generate strong API key
   openssl rand -hex 32
   
   # Set as secret
   wrangler secret put API_KEY --config wrangler.brainsait.toml
   ```

2. **Never Commit Keys**
   - Keys are stored as Cloudflare secrets
   - Not visible in code or logs
   - Rotate every 90 days

### CORS Configuration

Default: Allow all origins (`*`)

To restrict:
```javascript
// In src/brainsait-rag.js
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://portals.elfadil.com',
  ...
};
```

### Rate Limiting

Configure in Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select `brainsait-portals`
3. Settings → Rate Limiting
4. Set limits (e.g., 100 requests/minute)

---

## Cost Optimization

### Current Setup

- **AI Gateway:** Caching reduces costs by 70-90%
- **R2 Storage:** ~$0.015/GB/month ($0.01 for 971MB)
- **Worker Requests:** First 100k/day free
- **OpenAI API:** ~$0.15 per 1M tokens (gpt-4o-mini)

### Estimated Monthly Cost

**Assuming 10,000 searches/month:**
- Cached (70%): 7,000 × $0 = $0
- Uncached (30%): 3,000 × $0.0002 = $0.60
- R2 Storage: $0.01
- **Total: ~$0.61/month**

### Tips

1. **Use caching:** Enable 1-hour cache for search results
2. **Keyword fallback:** Use local search when AI not needed
3. **Batch queries:** Combine related questions
4. **Monitor usage:** Check AI Gateway dashboard

---

## Next Steps

### 1. Deploy to Production

```bash
cd /Users/fadil369/oracle-setup
wrangler deploy --config wrangler.brainsait.toml
```

### 2. Upload Data

```bash
./upload_to_r2.sh
```

### 3. Test Integration

```bash
# Test from oracle portals
curl https://brainsait-portals.elfadil.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "Test query"}'
```

### 4. Integrate with UI

Add search widget to your portals UI at:
```
https://portals.elfadil.com
```

---

## Support

- **Repository:** https://github.com/Fadil369/oracle-setup
- **Documentation:** This file + `/Volumes/NetworkShare/ContentPipeline/HNH_AI_SEARCH_GUIDE.md`
- **Logs:** `wrangler tail --config wrangler.brainsait.toml`

---

*Deployed 2026-03-27 by GitHub Copilot CLI*
