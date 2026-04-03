#!/bin/bash
# Upload HNH RAG Index to Cloudflare R2 via Worker

set -e

WORKER_URL="https://brainsait-portals.elfadil.com"
INDEX_FILE="/Volumes/NetworkShare/ContentPipeline/hnh_processed/rag_index.json"
METADATA_FILE="/Volumes/NetworkShare/ContentPipeline/hnh_processed/metadata.json"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Upload HNH Data to BrainSAIT Portals       ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo

# Check if files exist
if [ ! -f "$INDEX_FILE" ]; then
    echo -e "${RED}✗ RAG index not found: $INDEX_FILE${NC}"
    echo "  Run: cd /Volumes/NetworkShare/ContentPipeline && python process_hnh_data.py"
    exit 1
fi

if [ ! -f "$METADATA_FILE" ]; then
    echo -e "${YELLOW}⚠ Metadata file not found (optional): $METADATA_FILE${NC}"
fi

# Check for API key
if [ -z "$BRAINSAIT_API_KEY" ]; then
    echo -e "${YELLOW}⚠ BRAINSAIT_API_KEY not set${NC}"
    read -sp "Enter API key for upload: " API_KEY
    echo
else
    API_KEY="$BRAINSAIT_API_KEY"
fi

# Upload RAG index
echo -e "${BLUE}Uploading RAG index...${NC}"
RAG_CONTENT=$(cat "$INDEX_FILE")

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/api/upload" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{
    \"filename\": \"hnh_processed/rag_index.json\",
    \"content\": $RAG_CONTENT
  }")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ RAG index uploaded successfully${NC}"
    echo "$BODY" | jq '.'
else
    echo -e "${RED}✗ Upload failed (HTTP $HTTP_CODE)${NC}"
    echo "$BODY"
    exit 1
fi

# Upload metadata if available
if [ -f "$METADATA_FILE" ]; then
    echo
    echo -e "${BLUE}Uploading metadata...${NC}"
    METADATA_CONTENT=$(cat "$METADATA_FILE")
    
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$WORKER_URL/api/upload" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $API_KEY" \
      -d "{
        \"filename\": \"hnh_processed/metadata.json\",
        \"content\": $METADATA_CONTENT
      }")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')
    
    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "${GREEN}✓ Metadata uploaded successfully${NC}"
    else
        echo -e "${YELLOW}⚠ Metadata upload failed (HTTP $HTTP_CODE)${NC}"
    fi
fi

echo
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Upload Complete!                            ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo
echo -e "${BLUE}Test your deployment:${NC}"
echo "  # Get statistics"
echo "  curl $WORKER_URL/api/stats | jq"
echo
echo "  # Search (keyword)"
echo "  curl -X POST $WORKER_URL/api/search \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"query\": \"BUPA claims in Riyadh\", \"use_ai\": false}' | jq"
echo
echo "  # Search (AI-powered)"
echo "  curl -X POST $WORKER_URL/api/search \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"query\": \"Analyze TAWUNIYA vs MEDGULF\"}' | jq"
echo
