#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const examplePath = path.join(repoRoot, '.env.example');
const envPath = path.join(repoRoot, '.env');

if (!fs.existsSync(examplePath)) {
  console.error(`Unable to find .env.example at ${examplePath}.`);
  console.error('Please ensure you are running this script from the project root.');
  process.exit(1);
}

if (fs.existsSync(envPath)) {
  console.log('.env already exists – skipping copy.');
  process.exit(0);
}

fs.copyFileSync(examplePath, envPath);
console.log('Created .env from .env.example.');
console.log('Update the new .env file with your real secrets before running the app.');
