# CargoDB ⚡

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)

A high-performance, append-only key-value engine and binary blob storage system built with in-memory offset indexing and automated compaction.

---

## Highlights

* **Append-Only Disk Log:** Fast sequential writes with tombstone-based deletions.
* **In-Memory Offset Indexing:** Sub-millisecond $O(1)$ reads directly from disk offsets.
* **Multi-Tenant Namespaces:** Partitioned bucket directories (`default`, `assets`, `analytics`).
* **Binary Blob Streaming:** Native support for images, archives, and files with MIME preservation.
* **Zero-Downtime Compaction:** Background reclamation of dead byte space without record loss.
* **Web Management Console:** Real-time glassmorphic UI with drag-and-drop file uploads.
* **Tooling Included:** TypeScript client SDK and global terminal CLI (`cargodb`).

---

## Architecture Overview

```text
       [ Writes / Updates / Deletions ]
                      │
                      ▼
         ┌─────────────────────────┐
         │ Append-Only Disk Log    │ ──> Writes never overwrite existing data
         └─────────────────────────┘
                      │
                      ▼
         ┌─────────────────────────┐
         │ In-Memory Offset Table  │ ──> Maps Key ➔ { byteOffset, length, type }
         └─────────────────────────┘
                      │
                      ▼
              [ Reads: O(1) Seek ]