#!/bin/sh
# Development preview helper (Emergent environment): Vite dev server on port 3000 with the emulator proxy.
export PATH=/root/toolchain/node22/bin:/root/toolchain/jre21/bin:/opt/node22/bin:/opt/jre21/bin:$PATH
export VITE_HMR_CLIENT_PORT=443
cd "$(dirname "$0")/.." && exec yarn dev
