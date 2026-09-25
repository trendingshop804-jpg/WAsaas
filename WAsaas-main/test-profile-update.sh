# WhatsApp Business Profile Update — Test Script
#
# Run this script to verify the Meta Graph API calls for profile picture + About updates.
#
# Prerequisites:
#   1. Meta App must have `whatsapp_business_management` approved in App Review
#   2. Set environment variables:
#      export ACCESS_TOKEN="your-long-lived-access-token"
#      export PHONE_NUMBER_ID="your-phone-number-id"
#      export WABA_ID="your-whatsapp-business-account-id"
#   3. Host a publicly accessible image URL: IMAGE_URL
#
# Usage:
#   chmod +x test-profile-update.sh
#   ./test-profile-update.sh
#

set -e

ACCESS_TOKEN="${ACCESS_TOKEN:-}"
PHONE_NUMBER_ID="${PHONE_NUMBER_ID:-}"
WABA_ID="${WABA_ID:-}"
IMAGE_URL="${IMAGE_URL:-https://via.placeholder.com/640x640.png?text=Test+Profile+Photo}"

if [ -z "$ACCESS_TOKEN" ] || [ -z "$PHONE_NUMBER_ID" ] || [ -z "$WABA_ID" ]; then
  echo "=============================================="
  echo "ERROR: Missing required environment variables."
  echo "=============================================="
  echo ""
  echo "  export ACCESS_TOKEN=\"your-long-lived-access-token\""
  echo "  export PHONE_NUMBER_ID=\"your-phone-number-id\""
  echo "  export WABA_ID=\"your-whatsapp-business-account-id\""
  echo "  export IMAGE_URL=\"https://your-server.com/photo.jpg\""
  echo ""
  echo "You can obtain these from:"
  echo "  - OAuth exchange results (whatsapp_connections table)"
  echo "  - or from your .env file if using the token method"
  echo ""
  exit 1
fi

API_VERSION="v21.0"

echo "=============================================="
echo " WhatsApp Business Profile Update — Test Call"
echo "=============================================="
echo ""
echo "Phone Number ID: $PHONE_NUMBER_ID"
echo "WABA ID:         $WABA_ID"
echo "Image URL:       $IMAGE_URL"
echo "API Version:     $API_VERSION"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Step 1: Upload image to Meta Media API
# POST /{phone-number-id}/media
# Returns: { "id": "{media-id}" }
# ──────────────────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────"
echo " Step 1: Upload image to Meta Media API"
echo " POST /${API_VERSION}/${PHONE_NUMBER_ID}/media"
echo "────────────────────────────────────────────"
echo ""

STEP1_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/media" \
  -d "image_url=${IMAGE_URL}" \
  -d "access_token=${ACCESS_TOKEN}")

STEP1_HTTP_CODE=$(echo "$STEP1_RESPONSE" | tail -n1)
STEP1_BODY=$(echo "$STEP1_RESPONSE" | head -n -1)

echo "HTTP Status: $STEP1_HTTP_CODE"
echo "Response:"
echo "$STEP1_BODY" | python3 -m json.tool 2>/dev/null || echo "$STEP1_BODY"
echo ""

if [ "$STEP1_HTTP_CODE" != "200" ]; then
  echo "❌ Step 1 FAILED. Cannot proceed."
  echo "   Common causes:"
  echo "   - Wrong/invalid access token (check expires)"
  echo "   - whatsapp_business_management permission not approved"
  echo "   - image_url not publicly accessible"
  echo "   - phone_number_id is incorrect"
  exit 1
fi

MEDIA_ID=$(echo "$STEP1_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null)

if [ -z "$MEDIA_ID" ]; then
  echo "❌ Could not extract media_id from response."
  exit 1
fi

echo "✓ Media ID obtained: $MEDIA_ID"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Step 2: Set profile picture using the media handle
# POST /{waba-id}/whatsapp_business_profile
# with profile_picture_handle = media_id
# Returns: { "success": true }
# ──────────────────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────"
echo " Step 2: Set profile picture via Business Profile API"
echo " POST /${API_VERSION}/${WABA_ID}/whatsapp_business_profile"
echo "────────────────────────────────────────────"
echo ""

STEP2_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "https://graph.facebook.com/${API_VERSION}/${WABA_ID}/whatsapp_business_profile" \
  -d "profile_picture_handle=${MEDIA_ID}" \
  -d "access_token=${ACCESS_TOKEN}")

STEP2_HTTP_CODE=$(echo "$STEP2_RESPONSE" | tail -n1)
STEP2_BODY=$(echo "$STEP2_RESPONSE" | head -n -1)

echo "HTTP Status: $STEP2_HTTP_CODE"
echo "Response:"
echo "$STEP2_BODY" | python3 -m json.tool 2>/dev/null || echo "$STEP2_BODY"
echo ""

if [ "$STEP2_HTTP_CODE" = "200" ]; then
  echo "✅ Profile picture update succeeded!"
  echo "   Changes may take a few minutes to propagate to WhatsApp."
else
  echo "❌ Step 2 FAILED."
  echo "   Common causes:"
  echo "   - profile_picture_handle invalid or expired"
  echo "   - whatsapp_business_management permission not approved"
  echo "   - WABA ID is incorrect"
  echo "   - Profile picture image does not meet requirements (JPEG/PNG, min resolution)"
  exit 1
fi

# ──────────────────────────────────────────────────────────────────────────────
# Bonus: Fetch current business profile to verify
# GET /{waba-id}/whatsapp_business_profile
# ──────────────────────────────────────────────────────────────────────────────
echo "────────────────────────────────────────────"
echo " Bonus: Fetch current WhatsApp Business Profile"
echo " GET /${API_VERSION}/${WABA_ID}/whatsapp_business_profile"
echo "────────────────────────────────────────────"
echo ""

FETCH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X GET "https://graph.facebook.com/${API_VERSION}/${WABA_ID}/whatsapp_business_profile?fields=about,profile_picture_url,address,description,name,websites&access_token=${ACCESS_TOKEN}")

FETCH_HTTP_CODE=$(echo "$FETCH_RESPONSE" | tail -n1)
FETCH_BODY=$(echo "$FETCH_RESPONSE" | head -n -1)

echo "HTTP Status: $FETCH_HTTP_CODE"
echo "Response:"
echo "$FETCH_BODY" | python3 -m json.tool 2>/dev/null || echo "$FETCH_BODY"
echo ""

# ──────────────────────────────────────────────────────────────────────────────
# Bonus: Update About text
# POST /{waba-id}/whatsapp_business_profile
# with about = "Your about text" (max 139 chars)
# ──────────────────────────────────────────────────────────────────────────────
ABOUT_TEXT="Available for demos 9AM-6PM. Book via this link: wa.me/yournumber"

if [ ${#ABOUT_TEXT} -le 139 ]; then
  echo "────────────────────────────────────────────"
  echo " Bonus: Update About text"
  echo " POST /${API_VERSION}/${WABA_ID}/whatsapp_business_profile"
  echo "────────────────────────────────────────────"
  echo ""

  ABOUT_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "https://graph.facebook.com/${API_VERSION}/${WABA_ID}/whatsapp_business_profile" \
    -d "about=${ABOUT_TEXT}" \
    -d "access_token=${ACCESS_TOKEN}")

  ABOUT_HTTP_CODE=$(echo "$ABOUT_RESPONSE" | tail -n1)
  ABOUT_BODY=$(echo "$ABOUT_RESPONSE" | head -n -1)

  echo "HTTP Status: $ABOUT_HTTP_CODE"
  echo "Response:"
  echo "$ABOUT_BODY" | python3 -m json.tool 2>/dev/null || echo "$ABOUT_BODY"

  if [ "$ABOUT_HTTP_CODE" = "200" ]; then
    echo "✅ About text update succeeded!"
  else
    echo "❌ About text update failed."
  fi
  echo ""
fi

echo "=============================================="
echo " Test Complete"
echo "=============================================="
echo "If profile picture updated successfully:"
echo "  1. Check your WhatsApp Business app (mobile or web)"
echo "  2. Navigate to Settings > Business Profile > Profile Photo"
echo "  3. The new photo should appear within minutes"
echo "=============================================="
