#!/bin/bash
set -e

npm install
npx tsx server/seed.ts
