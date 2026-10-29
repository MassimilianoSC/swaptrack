#!/bin/sh
# Development helper: builds the functions and starts the Firebase emulators (project demo-swaptrack only).
# Toolchain installed under /root/toolchain (persistent); /opt/node22 and /opt/jre21 are optional symlinks.
export PATH=/root/toolchain/node22/bin:/root/toolchain/jre21/bin:/opt/node22/bin:/opt/jre21/bin:$PATH
# No cloud metadata server in containers: fail fast instead of hanging (DECISIONS).
export GCE_METADATA_HOST=127.0.0.1:1 GCE_METADATA_IP=127.0.0.1:1 METADATA_SERVER_DETECTION=none
cd "$(dirname "$0")/.." || exit 1
mkdir -p .emulator-data
(cd functions && yarn build) || exit 1
(cd functions && yarn watch > /tmp/functions-watch.log 2>&1 &)
exec node node_modules/firebase-tools/lib/bin/firebase.js emulators:start --project demo-swaptrack \
  --only auth,firestore,functions,storage,pubsub --import ./.emulator-data --export-on-exit ./.emulator-data
