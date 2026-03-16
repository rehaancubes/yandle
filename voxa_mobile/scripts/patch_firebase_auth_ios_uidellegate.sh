#!/bin/sh
# Ensures firebase_auth iOS plugin never passes nil UIDelegate to Firebase SDK (fixes iOS crash).
# Run after: flutter pub get
set -e
CACHE="${PUB_CACHE:-$HOME/.pub-cache}"
FILE=$(find "$CACHE/hosted" -path "*/firebase_auth-*/ios/firebase_auth/Sources/firebase_auth/FLTPhoneNumberVerificationStreamHandler.m" 2>/dev/null | head -1)
if [ -z "$FILE" ]; then
  echo "firebase_auth iOS source not found. Run: flutter pub get"
  exit 1
fi
if grep -q "Always return a non-nil delegate" "$FILE"; then
  echo "Patch already applied: $FILE"
  exit 0
fi
# Replace "if (!root) return nil;" with comment so we always return impl (non-nil)
sed -i '' 's/  if (!root) return nil;/  \/\/ Always return a non-nil delegate so Firebase SDK never force-unwraps nil (iOS crash fix)./g' "$FILE" || true
# If sed didn't match (e.g. already patched), try the alternative
if grep -q "return nil;" "$FILE"; then
  sed -i '' 's/  if (!root) return nil;/  \/\/ Never return nil - use impl with nil presentingViewController./g' "$FILE" || true
fi
echo "Patched: $FILE"
