# 🚀 BrainSAIT RAG Integration - Quick Start

**5-Minute Setup Guide**

---

## Prerequisites

- ✅ Cloudflare account (d7b99530559ab4f2545e9bdc72a7ab9b)
- ✅ Wrangler CLI installed
- ✅ OpenAI API key
- ✅ HNH data processed (already done ✓)

---

## Step 1: Create KV Namespace (2 min)

```bash
cd /Users/fadil369/oracle-setup

wrangler kv namespace create "SEARCH_CACHE" --config wrangler.brainsait.toml
```

**Output:** Copy the namespace ID

**Update:** Edit `wrangler.brainsait.toml` and replace `YOUR_KV_NAMESPACE_ID`

---

## Step 2: Set Secrets (1 min)

```bash
# OpenAI API key
wrangler secret put OPENAI_API_KEY --config wrangler.brainsait.toml
# Paste your OpenAI API key when prompted

# Upload API key (generate a random string)
wrangler secret put API_KEY --config wrangler.brainsait.toml
# Enter a strong random string (save it!)

# Save for later use
export BRAINSAIT_API_KEY="your-api-key-here"
```

---

## Step 3: Deploy Worker (1 min)

```bash
wrangler deploy --config wrangler.brainsait.toml
```

**Expected output:**
```
✨ Successfully published your script
🌎 https://brainsait-portals.elfadil.com
```

---

## Step 4: Upload Data (1 min)

```bash
./upload_to_r2.sh
```

**Expected output:**
```
✓ RAG index uploaded successfully
✓ Metadata uploaded successfully
```

---

## Step 5: Test! (<1 min)

```bash
# Health check
curl https://brainsait-portals.elfadil.com/health | jq

# Statistics
curl https://brainsait-portals.elfadil.com/api/stats | jq

# Search
curl -X POST https://brainsait-portals.elfadil.com/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "Show BUPA claims in Riyadh"}' | jq
```

---

## ✅ Done!

Your BrainSAIT RAG search is live at:
**https://brainsait-portals.elfadil.com**

---

## Next Steps

### Integrate with Oracle Portals

Add to your portal UI JavaScript:

```javascript
async function searchHealthcareData(query) {
  const response = await fetch('https://brainsait-portals.elfadil.com/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return await response.json();
}

// Usage
const result = await searchHealthcareData('Show claims for patient X');
console.log(result.ai_analysis);
```

### Local Search Tool

```bash
# Use local AI search anytime
/Volumes/NetworkShare/ContentPipeline/hnh_search --stats
/Volumes/NetworkShare/ContentPipeline/hnh_search Show BUPA trends
```

---

## Troubleshooting

### "RAG index not loaded"
→ Run: `./upload_to_r2.sh`

### "Unauthorized" on upload
→ Check: `wrangler secret put API_KEY --config wrangler.brainsait.toml`

### No AI response
→ Check: `wrangler secret put OPENAI_API_KEY --config wrangler.brainsait.toml`

---

## Documentation

📖 **Full Deployment Guide:** `BRAINSAIT_RAG_DEPLOYMENT.md`  
📊 **Integration Summary:** `INTEGRATION_SUMMARY.md`  
🔧 **User Guide:** `/Volumes/NetworkShare/ContentPipeline/HNH_AI_SEARCH_GUIDE.md`

---

**Total Setup Time:** ~5 minutes  
**Cost:** ~$0.61/month (10k searches)  
**Support:** https://github.com/Fadil369/oracle-setup
