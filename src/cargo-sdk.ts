import * as fs from 'fs';
import * as path from 'path';

export interface CargoConfig {
  endpoint: string;
  apiKey: string;
  defaultBucket?: string;
}

export class CargoClient {
  private endpoint: string;
  private apiKey: string;
  private defaultBucket: string;

  constructor(config: CargoConfig) {
    this.endpoint = config.endpoint.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.defaultBucket = config.defaultBucket || 'default';
  }

  // --- Key-Value Operations ---

  public async set(key: string, value: any, bucket = this.defaultBucket): Promise<boolean> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/payload/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ value }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[Cargo] Failed to set key '${key}': ${err.error || res.statusText}`);
    }

    return true;
  }

  public async get<T = any>(key: string, bucket = this.defaultBucket): Promise<T | null> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/payload/${encodeURIComponent(key)}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[Cargo] Failed to get key '${key}': ${err.error || res.statusText}`);
    }

    const data = await res.json();
    try {
      return JSON.parse(data.value) as T;
    } catch {
      return data.value as T;
    }
  }

  public async delete(key: string, bucket = this.defaultBucket): Promise<boolean> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/payload/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'x-api-key': this.apiKey },
    });

    if (res.status === 404) return false;

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[Cargo] Failed to delete key '${key}': ${err.error || res.statusText}`);
    }

    return true;
  }

  // --- Binary Blob Operations ---

  public async uploadBlob(key: string, filePath: string, bucket = this.defaultBucket): Promise<boolean> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), fileName);

    const res = await fetch(`${this.endpoint}/api/${bucket}/blob/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(`[Cargo] Failed to upload blob '${key}': ${err.error || res.statusText}`);
    }

    return true;
  }

  public async downloadBlob(key: string, destinationPath: string, bucket = this.defaultBucket): Promise<void> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/payload/${encodeURIComponent(key)}`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`[Cargo] Failed to download blob '${key}': ${res.statusText}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    fs.writeFileSync(destinationPath, Buffer.from(arrayBuffer));
  }

  // --- Maintenance & Telemetry ---

  public async compact(bucket = this.defaultBucket): Promise<{ reclaimedBytes: number }> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/compact`, {
      method: 'POST',
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) throw new Error(`[Cargo] Compaction failed: ${res.statusText}`);
    return await res.json();
  }

  public async getTelemetry(bucket = this.defaultBucket): Promise<any> {
    const res = await fetch(`${this.endpoint}/api/${bucket}/telemetry`, {
      headers: { 'x-api-key': this.apiKey },
    });

    if (!res.ok) throw new Error(`[Cargo] Telemetry fetch failed: ${res.statusText}`);
    return await res.json();
  }
}