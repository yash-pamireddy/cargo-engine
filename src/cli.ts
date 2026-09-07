#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { CargoClient } from './cargo-sdk';
import * as path from 'path';

const program = new Command();

const client = new CargoClient({
  endpoint: process.env.CARGO_URL || 'http://localhost:3000',
  apiKey: process.env.CARGO_KEY || 'cargo_live_secret99',
  defaultBucket: 'default',
});

function handleCliError(err: any) {
  if (err?.cause?.code === 'ECONNREFUSED' || err?.message?.includes('fetch failed')) {
    console.error(
      `\x1b[31m✖ Error: Could not connect to Cargo Engine.\x1b[0m\n` +
      `  Make sure the server is actively running in another terminal via:\n` +
      `  \x1b[36mnpm start\x1b[0m`
    );
  } else {
    console.error(`\x1b[31m✖ Error:\x1b[0m ${err.message}`);
  }
}

program
  .name('cargodb')
  .description('Official CLI for Cargo Storage Engine')
  .version('1.0.0');

// Command: put <key> <value>
program
  .command('put <key> <value>')
  .description('Store a key-value pair in a bucket')
  .option('-b, --bucket <bucket>', 'Target bucket', 'default')
  .action(async (key, value, options) => {
    try {
      let parsed = value;
      try {
        parsed = JSON.parse(value);
      } catch {
        // Keep as raw string if not valid JSON
      }

      await client.set(key, parsed, options.bucket);
      console.log(`\x1b[32m✔ Committed:\x1b[0m [${options.bucket}] ${key}`);
    } catch (err: any) {
      handleCliError(err);
    }
  });

// Command: get <key>
program
  .command('get <key>')
  .description('Retrieve a value by key')
  .option('-b, --bucket <bucket>', 'Target bucket', 'default')
  .action(async (key, options) => {
    try {
      const data = await client.get(key, options.bucket);
      if (data === null) {
        console.log(`\x1b[33m! Key not found\x1b[0m`);
        return;
      }
      console.log(typeof data === 'object' ? JSON.stringify(data, null, 2) : data);
    } catch (err: any) {
      handleCliError(err);
    }
  });

// Command: del <key>
program
  .command('del <key>')
  .description('Append a tombstone deletion for a key')
  .option('-b, --bucket <bucket>', 'Target bucket', 'default')
  .action(async (key, options) => {
    try {
      const ok = await client.delete(key, options.bucket);
      if (ok) {
        console.log(`\x1b[32m✔ Tombstone applied:\x1b[0m [${options.bucket}] ${key}`);
      } else {
        console.log(`\x1b[33m! Key not found\x1b[0m`);
      }
    } catch (err: any) {
      handleCliError(err);
    }
  });

// Command: upload <filePath>
program
  .command('upload <filePath>')
  .description('Upload a binary file blob')
  .option('-k, --key <key>', 'Custom storage key (defaults to filename)')
  .option('-b, --bucket <bucket>', 'Target bucket', 'default')
  .action(async (filePath, options) => {
    try {
      const resolved = path.resolve(filePath);
      const key = options.key || path.basename(resolved);

      await client.uploadBlob(key, resolved, options.bucket);
      console.log(`\x1b[32m✔ Blob uploaded:\x1b[0m [${options.bucket}] ${key}`);
    } catch (err: any) {
      handleCliError(err);
    }
  });

// Command: status
program
  .command('status')
  .description('Inspect partition telemetry')
  .option('-b, --bucket <bucket>', 'Target bucket', 'default')
  .action(async (options) => {
    try {
      const data = await client.getTelemetry(options.bucket);
      console.log(`\n\x1b[1;36m--- Cargo Telemetry [${options.bucket}] ---\x1b[0m`);
      console.log(`Active Keys     : ${data.keysCount}`);
      console.log(`Disk Consumption: ${(data.diskUsageBytes / 1024).toFixed(2)} KB`);
      console.log(`Total Engine Ops: ${data.totalOperations}\n`);
    } catch (err: any) {
      handleCliError(err);
    }
  });

program.parse(process.argv);