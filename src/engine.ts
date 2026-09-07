import * as fs from 'fs';
import * as path from 'path';

interface RecordMeta {
  offset: number;
  length: number;
  timestamp: number;
  isBlob?: boolean;
  mimeType?: string;
}

export class CargoEngine {
  private baseDir: string;
  private bucketLogs: Map<string, number> = new Map();
  private bucketIndexes: Map<string, Map<string, RecordMeta>> = new Map();
  private bucketOffsets: Map<string, number> = new Map();
  public totalOperations = 0;

  constructor(baseDir = './cargo_data') {
    this.baseDir = path.resolve(baseDir);
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  public initBucket(bucketName = 'default'): void {
    if (this.bucketLogs.has(bucketName)) return;

    const bucketPath = path.join(this.baseDir, bucketName);
    if (!fs.existsSync(bucketPath)) {
      fs.mkdirSync(bucketPath, { recursive: true });
    }

    const logPath = path.join(bucketPath, 'cargo.log');
    const fd = fs.openSync(logPath, 'a+');
    this.bucketLogs.set(bucketName, fd);
    this.bucketIndexes.set(bucketName, new Map());
    this.bucketOffsets.set(bucketName, 0);

    this.buildIndex(bucketName, logPath);
  }

  public set(bucket: string, key: string, value: string): void {
    this.initBucket(bucket);
    const fd = this.bucketLogs.get(bucket)!;
    const currentOffset = this.bucketOffsets.get(bucket)!;
    const timestamp = Date.now();

    const payload = JSON.stringify({ key, value, timestamp, isDeleted: false, isBlob: false }) + '\n';
    const buffer = Buffer.from(payload, 'utf-8');
    const length = buffer.length;

    fs.writeSync(fd, buffer, 0, length, currentOffset);

    this.bucketIndexes.get(bucket)!.set(key, { offset: currentOffset, length, timestamp });
    this.bucketOffsets.set(bucket, currentOffset + length);
    this.totalOperations++;
  }

  public storeBlob(bucket: string, key: string, buffer: Buffer, mimeType: string): void {
    this.initBucket(bucket);
    const fd = this.bucketLogs.get(bucket)!;
    const currentOffset = this.bucketOffsets.get(bucket)!;
    const timestamp = Date.now();

    const metaLine = JSON.stringify({ key, timestamp, isBlob: true, mimeType, byteSize: buffer.length }) + '\n';
    const metaBuffer = Buffer.from(metaLine, 'utf-8');

    // Combine metadata line + raw binary bytes + newline
    const totalBuffer = Buffer.concat([metaBuffer, buffer, Buffer.from('\n')]);
    const length = totalBuffer.length;

    fs.writeSync(fd, totalBuffer, 0, length, currentOffset);

    this.bucketIndexes.get(bucket)!.set(key, {
      offset: currentOffset,
      length,
      timestamp,
      isBlob: true,
      mimeType,
    });

    this.bucketOffsets.set(bucket, currentOffset + length);
    this.totalOperations++;
  }

  public get(bucket: string, key: string): { value: any; isBlob: boolean; mimeType?: string; timestamp: number } | null {
    this.initBucket(bucket);
    const meta = this.bucketIndexes.get(bucket)?.get(key);
    if (!meta) return null;

    const fd = this.bucketLogs.get(bucket)!;
    const buffer = Buffer.alloc(meta.length);
    fs.readSync(fd, buffer, 0, meta.length, meta.offset);

    if (meta.isBlob) {
      const lineEnd = buffer.indexOf(10); // Find first newline separating JSON meta and binary
      const binaryData = buffer.subarray(lineEnd + 1, meta.length - 1); // Exclude final newline
      this.totalOperations++;
      return { value: binaryData, isBlob: true, mimeType: meta.mimeType, timestamp: meta.timestamp };
    }

    const record = JSON.parse(buffer.toString('utf-8'));
    this.totalOperations++;
    return { value: record.value, isBlob: false, timestamp: record.timestamp };
  }

  public delete(bucket: string, key: string): boolean {
    this.initBucket(bucket);
    const index = this.bucketIndexes.get(bucket)!;
    if (!index.has(key)) return false;

    const fd = this.bucketLogs.get(bucket)!;
    const currentOffset = this.bucketOffsets.get(bucket)!;
    const timestamp = Date.now();

    const payload = JSON.stringify({ key, timestamp, isDeleted: true }) + '\n';
    const buffer = Buffer.from(payload, 'utf-8');
    const length = buffer.length;

    fs.writeSync(fd, buffer, 0, length, currentOffset);
    this.bucketOffsets.set(bucket, currentOffset + length);
    index.delete(key);
    this.totalOperations++;
    return true;
  }

  public compact(bucket: string): { originalBytes: number; compactedBytes: number; reclaimedBytes: number } {
    this.initBucket(bucket);
    const originalBytes = this.bucketOffsets.get(bucket)!;
    const bucketDir = path.join(this.baseDir, bucket);
    const mainLogPath = path.join(bucketDir, 'cargo.log');
    const tempPath = path.join(bucketDir, 'cargo.compact.tmp');

    const mainFd = this.bucketLogs.get(bucket)!;
    const tempFd = fs.openSync(tempPath, 'w+');

    const index = this.bucketIndexes.get(bucket)!;
    const newIndex = new Map<string, RecordMeta>();
    let newOffset = 0;

    for (const [key, meta] of index.entries()) {
      const buffer = Buffer.alloc(meta.length);
      fs.readSync(mainFd, buffer, 0, meta.length, meta.offset);

      fs.writeSync(tempFd, buffer, 0, meta.length, newOffset);
      newIndex.set(key, { ...meta, offset: newOffset });
      newOffset += meta.length;
    }

    fs.closeSync(mainFd);
    fs.closeSync(tempFd);
    fs.renameSync(tempPath, mainLogPath);

    this.bucketLogs.set(bucket, fs.openSync(mainLogPath, 'a+'));
    this.bucketIndexes.set(bucket, newIndex);
    this.bucketOffsets.set(bucket, newOffset);
    this.totalOperations++;

    return {
      originalBytes,
      compactedBytes: newOffset,
      reclaimedBytes: originalBytes - newOffset,
    };
  }

  public getTelemetry(bucket = 'default') {
    this.initBucket(bucket);
    const index = this.bucketIndexes.get(bucket)!;
    const entries: any[] = [];

    for (const [key, meta] of index.entries()) {
      entries.push({ key, isBlob: !!meta.isBlob, mimeType: meta.mimeType, size: meta.length });
    }

    return {
      bucket,
      keysCount: index.size,
      diskUsageBytes: this.bucketOffsets.get(bucket) || 0,
      totalOperations: this.totalOperations,
      entries,
    };
  }

  private buildIndex(bucket: string, logPath: string): void {
    if (!fs.existsSync(logPath)) return;

    const stats = fs.statSync(logPath);
    let offset = 0;
    const buffer = fs.readFileSync(logPath);
    const index = this.bucketIndexes.get(bucket)!;

    while (offset < stats.size) {
      const nextNewline = buffer.indexOf(10, offset);
      if (nextNewline === -1) break;

      const lineStr = buffer.subarray(offset, nextNewline).toString('utf-8');
      let meta: any = null;
      try {
        meta = JSON.parse(lineStr);
      } catch {
        offset = nextNewline + 1;
        continue;
      }

      if (meta.isBlob) {
        const totalBlobRecordLen = (nextNewline - offset + 1) + meta.byteSize + 1;
        index.set(meta.key, {
          offset,
          length: totalBlobRecordLen,
          timestamp: meta.timestamp,
          isBlob: true,
          mimeType: meta.mimeType,
        });
        offset += totalBlobRecordLen;
      } else {
        const recordLen = nextNewline - offset + 1;
        if (meta.isDeleted) {
          index.delete(meta.key);
        } else {
          index.set(meta.key, {
            offset,
            length: recordLen,
            timestamp: meta.timestamp,
            isBlob: false,
          });
        }
        offset += recordLen;
      }
    }
    this.bucketOffsets.set(bucket, stats.size);
  }
}