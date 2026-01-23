#!/bin/bash
# Test Document AI with a real PDF file
# Usage: ./scripts/test-docai.sh /path/to/policy.pdf

set -e
cd "$(dirname "$0")/.."

if [ -z "$1" ]; then
  echo "Usage: $0 <path-to-pdf-or-image>"
  echo ""
  echo "Example:"
  echo "  $0 /path/to/insurance-policy.pdf"
  echo "  $0 /path/to/document.png"
  exit 1
fi

FILE_PATH="$1"

if [ ! -f "$FILE_PATH" ]; then
  echo "❌ File not found: $FILE_PATH"
  exit 1
fi

# Determine MIME type
case "$FILE_PATH" in
  *.pdf) MIME_TYPE="application/pdf" ;;
  *.png) MIME_TYPE="image/png" ;;
  *.jpg|*.jpeg) MIME_TYPE="image/jpeg" ;;
  *.tiff|*.tif) MIME_TYPE="image/tiff" ;;
  *) MIME_TYPE="application/pdf" ;;  # default
esac

echo "📄 Testing Document AI"
echo "   File: $FILE_PATH"
echo "   MIME: $MIME_TYPE"
echo "   Size: $(du -h "$FILE_PATH" | cut -f1)"
echo ""

# Get access token
echo "🔑 Getting access token..."
HEADER=$(echo -n '{"alg":"RS256","typ":"JWT"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')
NOW=$(date +%s)
EXP=$((NOW + 3600))
PAYLOAD=$(echo -n "{\"iss\":\"isbu-police-police-okuma@gen-lang-client-0171803889.iam.gserviceaccount.com\",\"scope\":\"https://www.googleapis.com/auth/cloud-platform\",\"aud\":\"https://oauth2.googleapis.com/token\",\"iat\":$NOW,\"exp\":$EXP}" | base64 -w0 | tr '+/' '-_' | tr -d '=')
PRIVATE_KEY=$(cat gcp-service-account.json | jq -r '.private_key')
SIGNATURE=$(echo -n "$HEADER.$PAYLOAD" | openssl dgst -sha256 -sign <(echo "$PRIVATE_KEY") | base64 -w0 | tr '+/' '-_' | tr -d '=')
JWT="$HEADER.$PAYLOAD.$SIGNATURE"
ACCESS_TOKEN=$(curl -s --max-time 15 -X POST https://oauth2.googleapis.com/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=$JWT" | jq -r '.access_token')

if [ -z "$ACCESS_TOKEN" ] || [ "$ACCESS_TOKEN" == "null" ]; then
  echo "❌ Failed to get access token"
  exit 1
fi
echo "   ✓ Token obtained"
echo ""

# Encode file
echo "📦 Encoding file..."
FILE_BASE64=$(base64 -w0 "$FILE_PATH")
echo "   ✓ Encoded ($(echo -n "$FILE_BASE64" | wc -c) bytes)"
echo ""

# Process with Document AI
echo "🔄 Processing with Document AI..."
RESPONSE=$(curl -s --max-time 120 \
  "https://us-documentai.googleapis.com/v1/projects/gen-lang-client-0171803889/locations/us/processors/c2741b178ab61433:process" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"rawDocument\": {
      \"mimeType\": \"$MIME_TYPE\",
      \"content\": \"$FILE_BASE64\"
    }
  }")

# Check for errors
ERROR=$(echo "$RESPONSE" | jq -r '.error.message // empty')
if [ -n "$ERROR" ]; then
  echo "❌ Error: $ERROR"
  exit 1
fi

echo "   ✓ Processing complete"
echo ""

# Display results
echo "════════════════════════════════════════════════════════════════"
echo "📊 EXTRACTED TEXT"
echo "════════════════════════════════════════════════════════════════"
echo "$RESPONSE" | jq -r '.document.text // "No text extracted"'
echo ""

# Form fields
FIELD_COUNT=$(echo "$RESPONSE" | jq -r '.document.pages[0].formFields | length // 0')
if [ "$FIELD_COUNT" -gt 0 ]; then
  echo "════════════════════════════════════════════════════════════════"
  echo "📋 FORM FIELDS ($FIELD_COUNT detected)"
  echo "════════════════════════════════════════════════════════════════"
  echo "$RESPONSE" | jq -r '.document.pages[].formFields[]? | "\(.fieldName.textAnchor.content // "?") → \(.fieldValue.textAnchor.content // "?")"' | head -20
  echo ""
fi

# Tables
TABLE_COUNT=$(echo "$RESPONSE" | jq -r '[.document.pages[].tables // []] | flatten | length')
if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "════════════════════════════════════════════════════════════════"
  echo "📊 TABLES ($TABLE_COUNT detected)"
  echo "════════════════════════════════════════════════════════════════"
fi

# Summary
echo "════════════════════════════════════════════════════════════════"
echo "📈 SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo "   Pages: $(echo "$RESPONSE" | jq -r '.document.pages | length // 0')"
echo "   Form fields: $FIELD_COUNT"
echo "   Tables: $TABLE_COUNT"
echo "   Text length: $(echo "$RESPONSE" | jq -r '.document.text | length // 0') chars"
echo ""
echo "✅ Document AI test complete!"
