# CargoDB ⚡

A high-performance, append-only key-value storage engine and binary blob store written in TypeScript. Designed with an in-memory byte-offset index for $O(1)$ point lookups, multi-tenant bucket partitioning, automated zero-downtime log compaction, and an embedded glassmorphic web dashboard.

---

## Features

* **Append-Only Disk Log:** Fast sequential writes eliminate in-place write hazards and simplify crash recovery.
* **$O(1)$ RAM Indexing:** Maps active keys directly to byte offsets and record lengths in memory for immediate point reads.
* **Unified Key-Value & Blobs:** Store structured JSON records alongside binary assets (images, PDFs, audio) with preserved MIME types.
* **Zero-Downtime Compaction:** Background garbage collection reclaims disk space taken by overwritten records and tombstones without interrupting service.
* **Multi-Tenant Partitioning:** Isolated data directories organized by distinct bucket namespaces.
* **Developer Tooling:** Comes equipped with a global shell CLI (`cargodb`), a fully typed TypeScript SDK, and an embedded web console.

---

## Architecture Overview

CargoDB applies log-structured storage principles inspired by Bitcask:

```text
               [ Set / Put / Upload / Delete ]
                              │
                              ▼
                 ┌─────────────────────────┐
                 │  Append-Only Disk Log   │ ──> Pure sequential writes
                 └─────────────────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │ In-Memory Offset Table  │ ──> Maps Key ➔ { offset, length, mime }
                 └─────────────────────────┘
                              │
                              ▼
                      [ Reads: O(1) Seek ]
