#!/bin/sh
# three.bundle.js を再生成する(three.js 更新時のみ実行。要Node)。
# ui/vendor/ に three.module.min.js と OrbitControls.js を置いてから実行する。
set -eu
cd "$(dirname "$0")"
npx -y esbuild _entry.js --bundle --minify \
  --alias:three=./three.module.min.js --format=iife --outfile=three.bundle.js
