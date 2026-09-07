import { CargoClient } from './cargo-sdk';

async function main() {
  // 1. Initialize the client
  const cargo = new CargoClient({
    endpoint: 'http://localhost:3000',
    apiKey: 'cargo_live_secret99',
    defaultBucket: 'analytics',
  });

  console.log('Connecting to Cargo Engine via SDK...');

  // 2. Put typed JSON records
  await cargo.set('user:session:42', {
    ip: '192.168.1.1',
    loggedAt: new Date().toISOString(),
    roles: ['admin', 'developer'],
  });
  console.log('Key stored successfully!');

  // 3. Read it back
  const session = await cargo.get('user:session:42');
  console.log('Retrieved record:', session);

  // 4. Query telemetry
  const stats = await cargo.getTelemetry('analytics');
  console.log(`Bucket Stats -> Keys: ${stats.keysCount}, Disk: ${(stats.diskUsageBytes / 1024).toFixed(2)} KB`);

  // 5. Delete the key
  await cargo.delete('user:session:42');
  console.log('Key removed with tombstone!');
}

main().catch(console.error);