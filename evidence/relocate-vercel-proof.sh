#!/usr/bin/env bash
set -eu
# Task-created disposable folders only; validate exact identities before moving.
test "$(realpath /app)" = /app
test "$(realpath /toolchain)" = /toolchain
test "$(sha256sum /app/package.json | cut -d ' ' -f 1)" = d179c8c4888e6813e025e0c68e64be74848f8974c3dcccb8419f92e1a111a5ae
test "$(sha256sum /app/package-lock.json | cut -d ' ' -f 1)" = c19d455cd3559287d28bd45ce05e5f194a7b606c2e698f2deb03a2c7b81cefe1
test -f /app/.vercel/output/config.json
test -f /build-vercel.log
test -f /toolchain/node-v22.23.5-linux-x64/bin/node
test ! -e /root/quellight-vercel-proof-20261116-1b2az8
mkdir /root/quellight-vercel-proof-20261116-1b2az8
mv -T -- /app /root/quellight-vercel-proof-20261116-1b2az8/app
mv -T -- /toolchain /root/quellight-vercel-proof-20261116-1b2az8/toolchain
mv -T -- /build-vercel.log /root/quellight-vercel-proof-20261116-1b2az8/build-vercel.log
printf '%s\n' 'Proof relocated to /root/quellight-vercel-proof-20261116-1b2az8'
