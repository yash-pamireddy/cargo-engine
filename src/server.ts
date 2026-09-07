import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import { CargoEngine } from './engine';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const CARGO_API_KEY = process.env.CARGO_API_KEY || 'cargo_live_secret99';
const DATA_DIR = process.env.CARGO_DATA_DIR || './cargo_data';

const cargo = new CargoEngine(DATA_DIR);
cargo.initBucket('default');

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Usage & Monetization Limits
const PLAN_LIMITS = {
  maxDiskBytes: 50 * 1024 * 1024, // 50MB limit
  maxOperations: 50000,
  planName: 'Developer Pro (Active)',
};

function authAndQuota(req: Request, res: Response, next: NextFunction) {
  const token = req.headers['x-api-key'] || req.query.apiKey;
  if (token !== CARGO_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Cargo API Key' });
  }

  if (cargo.totalOperations >= PLAN_LIMITS.maxOperations) {
    return res.status(402).json({ error: 'Plan Limit Exceeded: Please upgrade your Cargo Plan' });
  }
  next();
}

// Key-Value Endpoints
app.post('/api/:bucket/payload/:key', authAndQuota, (req: Request, res: Response) => {
  const { bucket, key } = req.params;
  const { value } = req.body;

  if (value === undefined) {
    return res.status(400).json({ error: 'Missing value' });
  }

  cargo.set(bucket, key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  res.status(201).json({ status: 'committed', bucket, key });
});

// Binary File / Blob Endpoints
app.post('/api/:bucket/blob/:key', authAndQuota, upload.single('file'), (req: Request, res: Response) => {
  const { bucket, key } = req.params;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  cargo.storeBlob(bucket, key, file.buffer, file.mimetype);
  res.status(201).json({ status: 'blob_stored', bucket, key, bytes: file.size });
});

// Universal Retrieval (JSON or raw binary)
app.get('/api/:bucket/payload/:key', authAndQuota, (req: Request, res: Response) => {
  const { bucket, key } = req.params;
  const record = cargo.get(bucket, key);

  if (!record) {
    return res.status(404).json({ error: 'Key not found' });
  }

  if (record.isBlob) {
    res.setHeader('Content-Type', record.mimeType || 'application/octet-stream');
    return res.send(record.value);
  }

  return res.json({ key, value: record.value, timestamp: record.timestamp });
});

app.delete('/api/:bucket/payload/:key', authAndQuota, (req: Request, res: Response) => {
  const { bucket, key } = req.params;
  const deleted = cargo.delete(bucket, key);
  if (!deleted) return res.status(404).json({ error: 'Key not found' });
  res.json({ status: 'tombstone_appended', key });
});

app.post('/api/:bucket/compact', authAndQuota, (req: Request, res: Response) => {
  const result = cargo.compact(req.params.bucket);
  res.json({ status: 'compacted', ...result });
});

// Telemetry & Billing Dashboard Data
app.get('/api/:bucket/telemetry', authAndQuota, (req: Request, res: Response) => {
  const telemetry = cargo.getTelemetry(req.params.bucket);
  res.json({
    ...telemetry,
    plan: {
      ...PLAN_LIMITS,
      usagePercent: ((telemetry.diskUsageBytes / PLAN_LIMITS.maxDiskBytes) * 100).toFixed(2),
    },
  });
});

app.listen(PORT, () => {
  console.log(`\x1b[36m⚡ Cargo Enterprise v2.0 Online -> http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[33m🔑 Master API Key: ${CARGO_API_KEY}\x1b[0m`);
  console.log(`\x1b[32m📁 Storage Path: ${DATA_DIR}\x1b[0m`);
});