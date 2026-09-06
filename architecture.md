# Honey Chain — MVP Architecture (as built)

**Team Odysseus · SIH 2026 · PS 26021**

This document freezes what we've actually built, as a reference for the team and
for demo prep. It should be read alongside `mvp.txt` (the scope decision that
produced this build) and the research docs (`understanding_our_chosen_problem_statement.`,
`related-works-and-sources.txt`, `deep-search_honeyChain.txt`), which explain *why*
each design choice was made.

> **One sentence:** A verified beekeeper monitors a hive with simulated IoT data,
> gets an AI-assisted health/yield insight, records a harvest, which becomes a honey
> batch anchored to a tamper-evident hash-chained ledger, moves through processing
> and a simulated quality test, and is packaged with a QR code that a consumer scans
> to see the full verified provenance journey — including a live integrity check.

---

## 1. What this MVP proves

Three demo capabilities, matching PS 26021's core asks:

```text
1. TRACEABLE BATCH        →  Harvest → Batch → hash-chained ledger events
2. SMART HIVE             →  Simulated sensors → AI health score + yield prediction
3. CONSUMER VERIFICATION  →  QR → provenance journey → live integrity check
```

Everything else from the research phase (Madhukranti/KVIC integration, FPO
marketplace, real lab APIs, batch split/merge genealogy, multi-role auth, trained
ML models, real IoT hardware) is **deliberately out of scope** — see Section 8.

---

## 2. System architecture

```text
                         ┌───────────────────────────┐
                         │        FRONTEND            │
                         │   React + Vite (SPA)       │
                         │                             │
                         │  /beekeeper   → Dashboard   │
                         │  /beekeeper/  → Hive Detail │
                         │   hives/:id                 │
                         │  /admin       → Batch        │
                         │                 Pipeline     │
                         │  /scan        → Consumer     │
                         │                 Verify        │
                         └──────────────┬──────────────┘
                                        │  fetch('/api/...')
                                        │  (Vite dev proxy → :4000)
                                        ▼
                         ┌───────────────────────────┐
                         │        BACKEND              │
                         │   Node.js + Express          │
                         │                              │
                         │  routes/                     │
                         │   ├─ beekeepers.js            │
                         │   ├─ hives.js                 │
                         │   ├─ harvests.js               │
                         │   ├─ batches.js                │
                         │   ├─ quality.js                 │
                         │   └─ products.js (+ public verify)│
                         │                                  │
                         │  services/                        │
                         │   ├─ ledger.js   (hash-chain)      │
                         │   ├─ ai.js       (health/yield)      │
                         │   └─ simulator.js (mock IoT)          │
                         └──────────────┬──────────────────────┘
                                        │
                                        ▼
                         ┌───────────────────────────┐
                         │      SQLite (node:sqlite)   │
                         │   built into Node 22.5+      │
                         │   — no native compilation     │
                         └───────────────────────────┘
```

**Why these choices:**

| Decision | Reasoning |
|---|---|
| SQLite via `node:sqlite` | Zero native dependencies (no node-gyp/Visual Studio pain, per our own Windows setup experience). Trivial to swap for Postgres later since all access goes through `db.prepare(...)`. |
| Hash-chained ledger instead of a real blockchain | Research finding: blockchain's *value* here is tamper-evidence + auditability, not decentralization. A real hash-chain gives an honest, independently verifiable integrity guarantee without standing up a testnet for a hackathon demo. Interface is designed to be swapped for a Solidity contract later without touching any route. |
| Rule-based AI instead of a trained model | Research finding: the PS explicitly warns against over-claiming disease diagnosis. Transparent thresholds are more defensible in judging than a black-box model with no real training data behind it yet. |
| Simulated IoT instead of real hardware first | De-risks the demo (hardware can fail 5 minutes before judging — this was flagged explicitly in `mvp.txt`). The data shape is real; only the source is mocked. |

---

## 3. Data model

```text
Beekeeper
   │
   ▼
 Apiary
   │
   ▼
  Hive ──────────────┐
   │                 │
   ▼                 ▼
SensorReading   (feeds AI: health score, yield prediction)
   │
   ▼
Harvest (hive_ids[], quantity_kg, floral_source)
   │
   ▼
Batch (batch_code, status)
   │
   ├── batch_events   (the ledger — append-only, hash-chained)
   ├── quality_tests  (simulated lab record)
   └── products       (QR token, activation)
```

### Entity summary (see `backend/db/schema.sql` for full DDL)

| Table | Purpose |
|---|---|
| `beekeepers` | Identity + verification flag (pre-verified for demo) |
| `apiaries` | Location grouping of hives |
| `hives` | Physical hive identity, species, status |
| `sensor_readings` | Time-series temp/humidity/weight (simulated or real) |
| `harvests` | Links hive(s) → quantity extracted on a date |
| `batches` | The traceable unit; carries `status` and a human-readable `batch_code` |
| `batch_events` | **The ledger.** Append-only, hash-chained, one row per lifecycle event |
| `quality_tests` | Simulated FSSAI-style lab record (moisture/HMF/C4 sugar) |
| `products` | QR token + activation timestamp, one per packaged batch |

**Batch status lifecycle:**

```text
CREATED → RECEIVED → TESTED → PROCESSED → PACKAGED
              │
              └──(fail)──→ QUARANTINED  (terminal — cannot advance)
```

---

## 4. The ledger — how "blockchain" actually works here

Implemented in `backend/services/ledger.js`. This is a real, functioning
hash-chain, not a decorative label:

```text
event N's hash = SHA256( event(N-1).hash + canonical(event N's fields) )
```

- `appendEvent()` is the **only** way rows are ever written to `batch_events` —
  never UPDATE or DELETE.
- `verifyChain()` recomputes every hash from genesis (`'0'.repeat(64)`) and
  compares against what's stored. Any tampering — even a single character in one
  event's payload — is detected and the exact broken event is named.
- We proved this during development: manually corrupting a row's `payload`
  directly in the SQLite file causes `verifyChain()` to correctly flag that exact
  `seq` number as broken, while everything before and after remains valid.

**Event vocabulary currently implemented:**

```text
HARVEST_RECORDED → BATCH_CREATED → BATCH_RECEIVED → BATCH_TESTED (or BATCH_FAILED)
→ BATCH_PROCESSED → QR_ACTIVATED
```

This is a subset of the fuller event vocabulary proposed in
`deep-search_honeyChain.txt` (Section 29) — deliberately trimmed to what the MVP
demo needs.

**On-chain vs off-chain**, per the research recommendation:

| On-chain (in `batch_events`) | Off-chain (in regular tables) |
|---|---|
| Event type, actor, timestamp, hashes | Raw sensor telemetry |
| Batch/harvest/hive IDs | Full quality-test parameter sets |
| Quality result (PASS/FAIL) | — |

---

## 5. AI layer

Implemented in `backend/services/ai.js`. Two functions, both clearly labeled as
predictions/heuristics — never diagnoses:

### `computeHealthScore(readings)`
- Rule-based scoring against normal ranges (temp 30–36°C, humidity 50–70%) plus a
  weight-trend check across the reading history.
- Output: `{ score: 0-100, status: Healthy|Attention|Critical, reason, flag }`
- Critical/Attention outputs include an explicit recommendation to inspect —
  never a disease name. This mirrors the NBB guidance found in research: AI should
  flag risk, not replace expert diagnosis.

### `predictYield(readings, healthScore)`
- Heuristic: harvestable yield ≈ 55% of observed weight gain, scaled down if the
  hive's health score is low.
- Output includes an explicit `confidence` percentage — always presented as a
  prediction in the UI, never a guarantee.

### `services/simulator.js`
- Generates 24 hours of readings per hive along three named profiles —
  `healthy`, `attention`, `critical` — tuned so each reliably produces the
  corresponding health status regardless of random jitter (useful for a
  predictable demo).
- This is the single component intended to be replaced by real hardware later
  (see below) — everything downstream only depends on the shape of a
  `sensor_readings` row, not its source.

---

## 6. API reference

All routes under `/api`. Full detail in `backend/routes/*.js`.

| Method & path | Purpose |
|---|---|
| `GET /health` | Liveness check |
| `GET/POST /beekeepers` | List / register beekeepers |
| `POST /beekeepers/:id/apiaries` | Register an apiary |
| `GET/POST /hives` | List (with live health snapshot) / register a hive |
| `GET /hives/:id` | Full detail: readings + AI health + yield prediction |
| `POST /hives/:id/simulate` | Regenerate readings under a named profile (demo control) |
| `POST /harvests` | Records harvest **and** creates the resulting batch; writes 2 ledger events |
| `GET /batches` / `GET /batches/:id` | List / full detail incl. ledger events, tests, product |
| `GET /batches/code/:code` | Lookup by human-readable batch code |
| `POST /batches/:id/advance` | Manual pipeline step (`BATCH_RECEIVED`, `BATCH_PROCESSED`) |
| `GET /batches/:id/verify` | Recomputes and reports **global** ledger integrity |
| `POST /batches/:batchId/quality-test` | Simulated lab test against FSSAI-style thresholds; quarantines on fail |
| `POST /batches/:batchId/activate-qr` | Packages the batch, generates QR image, writes `QR_ACTIVATED` event |
| `GET /verify/:qrToken` | **Public** consumer endpoint — provenance + journey + live integrity check |

---

## 7. Frontend

React + Vite SPA, three personas as separate routes:

```text
/beekeeper                    → Apiary overview + hive list with live health pills
/beekeeper/hives/:hiveId      → Sensor readings, AI insight, "Record Harvest" action,
                                 live profile-switch buttons for demo purposes
/admin                        → Batch pipeline: select a batch, walk it through
                                 Received → Quality Test (Pass/Force-Fail) → Processed
                                 → Package & Activate QR; shows the ledger journey
                                 with truncated hashes
/scan  and  /scan/:qrToken    → Consumer verification: paste or scan a batch code,
                                 see origin, harvest detail, quality result, full
                                 traceability journey, and the live integrity check
```

Shared styling in `src/index.css` (warm amber/honey theme). API calls centralized
in `src/api.js`.

---

## 8. Explicitly out of scope for this MVP

Carried over from `mvp.txt`, unchanged:

| Feature | Status |
|---|---|
| Real blockchain network (testnet/mainnet contract) | ❌ (hash-chain stands in) |
| FPO / marketplace layer | ❌ |
| Real laboratory API integration | ❌ (simulated record only) |
| Madhukranti / KVIC Honey MIS integration | ❌ (architected to allow later) |
| Multi-role authentication | ❌ (single shared demo login) |
| Batch split / merge genealogy | ❌ (schema allows; not exposed in UI) |
| Trained ML disease/yield models | ❌ (rule-based heuristics only) |
| Real IoT hardware | ❌ (simulation mode; see roadmap below) |

---

## 9. Extension points (designed-in, not yet built)

These were kept in mind while building so the MVP doesn't need a rewrite later:

- **Real IoT**: add `POST /api/hives/:id/readings` accepting the same row shape
  `simulator.js` already produces; point an ESP32 (DHT22 + load cell) at it. No
  change needed to `ai.js`, the dashboard, or anything downstream — the AI layer
  is IoT-source-agnostic by design.
- **Real blockchain**: `services/ledger.js`'s two functions (`appendEvent`,
  `verifyChain`) are the entire interface every route depends on. Swapping the
  internals for a Solidity contract call (e.g. on Polygon) means editing one file.
- **Batch genealogy**: `batches` table and event vocabulary already anticipate
  split/merge (see `deep-search_honeyChain.txt` §15); just needs UI + a couple of
  new event types (`BATCH_SPLIT`, `BATCH_MERGED`).
- **Government integration**: `beekeepers.id` and `hives.id` are plain strings
  specifically so they can later be swapped for Madhukranti/KVIC-issued IDs
  without a schema change.

---

## 10. Project file structure

```text
honey-chain-mvp/
├── README.md                 # setup + demo script
├── architecture.md           # this file
├── backend/
│   ├── package.json
│   ├── server.js              # Express entrypoint, mounts all routes
│   ├── db/
│   │   ├── schema.sql          # full DDL, all 9 tables
│   │   ├── db.js               # node:sqlite connection + transaction shim
│   │   └── seed.js             # demo data: Ramesh Patil + 6 hives
│   ├── services/
│   │   ├── ledger.js            # hash-chained event ledger
│   │   ├── ai.js                 # health score + yield prediction
│   │   └── simulator.js           # mock IoT sensor generator
│   └── routes/
│       ├── beekeepers.js
│       ├── hives.js
│       ├── harvests.js
│       ├── batches.js
│       ├── quality.js
│       └── products.js            # QR activation + public verify
└── frontend/
    └── src/
        ├── api.js                  # fetch wrapper for all backend calls
        ├── App.jsx                  # router
        ├── index.css                 # honey/amber theme
        ├── components/TopBar.jsx
        └── pages/
            ├── BeekeeperDashboard.jsx
            ├── HiveDetail.jsx
            ├── AdminBatchPipeline.jsx
            └── ConsumerScan.jsx
```

---

## 11. The demo script (hero workflow)

1. **Beekeeper** → open a healthy hive and a critical hive side by side; show the
   AI health score and yield prediction reacting live via the "Simulate: Critical"
   button.
2. **Record Harvest** on a hive → batch is created, two events land on the ledger
   immediately.
3. **Processing / Lab** → walk the batch through Received → Quality Test (run the
   **Force Fail** path once to show quarantine) → Processed → Package & Activate
   QR. Point out the journey view growing a new hash-linked entry at each step.
4. **Consumer Scan** → paste the batch code → full provenance + a green "all
   events verified" integrity check.
5. **The proof moment**: tamper with one ledger row directly in the database file,
   re-run the consumer verify, and show it naming the exact broken event. This is
   the single strongest thing to show a judge — it's a genuine security property,
   not a UI claim.
