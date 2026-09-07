import axios from 'axios';

const BASE_URL = 'http://localhost:3000/api/payload';
const API_KEY = 'cargo_live_secret99';
const TOTAL_OPERATIONS = 1000;
const CONCURRENCY = 20;

const client = axios.create({
  headers: {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
  }
});

async function runWorker(
  taskFn: (i: number) => Promise<void>,
  total: number,
  concurrency: number
) {
  let currentIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (currentIndex < total) {
      const idx = currentIndex++;
      await taskFn(idx);
    }
  });
  await Promise.all(workers);
}

async function benchmark() {
  console.log('\x1b[1;36m========================================\x1b[0m');
  console.log('\x1b[1;35m       CARGO LOAD BENCHMARK SUITE       \x1b[0m');
  console.log('\x1b[1;36m========================================\x1b[0m');
  console.log(`Total Requests: ${TOTAL_OPERATIONS} per phase`);
  console.log(`Concurrency   : ${CONCURRENCY} parallel streams\n`);

  // --- Phase 1: Sequential Append Writes ---
  process.stdout.write('Running Write Benchmark...');
  const writeStart = performance.now();

  await runWorker(async (i) => {
    await client.post(`${BASE_URL}/bench:key:${i}`, {
      value: JSON.stringify({ index: i, payload: 'Cargo performance test chunk', ts: Date.now() })
    });
  }, TOTAL_OPERATIONS, CONCURRENCY);

  const writeDuration = (performance.now() - writeStart) / 1000;
  const writeRps = (TOTAL_OPERATIONS / writeDuration).toFixed(2);
  const writeAvgLatency = ((writeDuration / TOTAL_OPERATIONS) * 1000).toFixed(2);

  console.log(' \x1b[32m[DONE]\x1b[0m');

  // --- Phase 2: Random O(1) Reads ---
  process.stdout.write('Running Read Benchmark...');
  const readStart = performance.now();

  await runWorker(async () => {
    const randomKey = Math.floor(Math.random() * TOTAL_OPERATIONS);
    await client.get(`${BASE_URL}/bench:key:${randomKey}`);
  }, TOTAL_OPERATIONS, CONCURRENCY);

  const readDuration = (performance.now() - readStart) / 1000;
  const readRps = (TOTAL_OPERATIONS / readDuration).toFixed(2);
  const readAvgLatency = ((readDuration / TOTAL_OPERATIONS) * 1000).toFixed(2);

  console.log(' \x1b[32m[DONE]\x1b[0m\n');

  // --- Results Summary ---
  console.log('\x1b[1;33m--- RESULTS ---\x1b[0m');
  console.log(`\x1b[1mWrites (Append-Only Log):\x1b[0m`);
  console.log(`  Throughput : \x1b[36m${writeRps} req/sec\x1b[0m`);
  console.log(`  Avg Latency: \x1b[36m${writeAvgLatency} ms\x1b[0m`);
  console.log(`  Total Time : ${writeDuration.toFixed(2)}s\n`);

  console.log(`\x1b[1mReads (RAM Index -> Disk Offset):\x1b[0m`);
  console.log(`  Throughput : \x1b[32m${readRps} req/sec\x1b[0m`);
  console.log(`  Avg Latency: \x1b[32m${readAvgLatency} ms\x1b[0m`);
  console.log(`  Total Time : ${readDuration.toFixed(2)}s`);
  console.log('\x1b[1;36m========================================\x1b[0m');
}

benchmark().catch((err) => {
  console.error('\x1b[31mBenchmark failed:\x1b[0m', err.message);
});