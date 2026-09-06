# 🍯 Honey Chain — MVP (Team Odysseus, SIH 2026 PS 26021)

A vertical-slice prototype of Honey Chain: a verified beekeeper monitors a hive via
simulated IoT data, gets an AI-assisted health score and yield prediction, records a
harvest, and that harvest becomes a **honey batch anchored to a tamper-evident event
ledger**. The batch moves through processing, a simulated quality test, and packaging,
then a consumer scans its QR code to see the full verified provenance journey.

This is the scope frozen in `mvp.txt` in the project research docs — deliberately a
thin, complete slice rather than a wide, half-built ecosystem.

## Architecture

```
frontend (React + Vite)  --/api-->  backend (Node/Express)  -->  SQLite (node:sqlite, built-in)
                                            |
                                            +--> services/ledger.js   (hash-chained event ledger)
                                            +--> services/ai.js       (rule-based health/yield scoring)
                                            +--> services/simulator.js (mock IoT sensor data)
```

### Why a hash-chain instead of a real blockchain for the MVP?

Per the team's own research (`related-works-and-sources.txt`, `deep-search_honeyChain.txt`):
blockchain's value here is **tamper-evidence + auditable event history**, not
decentralization for its own sake. `services/ledger.js` implements a genuine
append-only, hash-chained ledger — every event's hash is `SHA256(prev_hash + event
data)`. Corrupt any row directly in the database and `GET /api/batches/:id/verify`
(and the consumer verify page) will correctly flag exactly which event broke. This is
real, demonstrable tamper-evidence, not a static "blockchain ✓" badge. The event
schema is designed so this module can be swapped for a real smart contract (e.g.
Polygon + Solidity) later without changing any caller.

### Why rule-based AI instead of a trained model?

Also per team research: the PS explicitly warns against over-claiming disease
diagnosis. `services/ai.js` produces a transparent, explainable **health score
(0–100) and status flag** (Healthy / Attention / Critical) from temperature,
humidity, and weight-trend thresholds, plus a **yield prediction** with an explicit
confidence percentage. Both are clearly labeled as predictions/heuristics, never as
diagnoses — matching the "AI-assisted risk detection, not authority" principle from
the research docs.

## Project structure

```
honey-chain-mvp/
├── backend/
│   ├── db/
│   │   ├── schema.sql       # entities: beekeepers, hives, harvests, batches, batch_events (ledger), quality_tests, products
│   │   ├── db.js            # SQLite connection + schema bootstrap
│   │   └── seed.js          # demo data: beekeeper "Ramesh Patil" + 6 hives (4 healthy, 1 attention, 1 critical)
│   ├── services/
│   │   ├── ledger.js        # hash-chained event ledger (append + verify)
│   │   ├── ai.js            # health score + yield prediction
│   │   └── simulator.js     # mock IoT sensor readings
│   ├── routes/               # beekeepers, hives, harvests, batches, quality, products
│   └── server.js
└── frontend/
    └── src/
        ├── pages/
        │   ├── BeekeeperDashboard.jsx   # hive list + register hive
        │   ├── HiveDetail.jsx           # sensors, AI insight, record harvest
        │   ├── AdminBatchPipeline.jsx   # processing/lab pipeline, ledger view, QR generation
        │   └── ConsumerScan.jsx         # public verify page + integrity check
        ├── components/TopBar.jsx
        └── api.js
```

## Running it locally

Requires **Node.js 22.5+** (uses Node's built-in `node:sqlite` module — no native
compilation, no Visual Studio Build Tools, no node-gyp headaches on Windows). Check
your version with `node -v`; if it's older, install the latest LTS from
[nodejs.org](https://nodejs.org).

```bash
# 1. Backend
cd backend
npm install
npm run seed      # creates demo beekeeper + 6 hives (safe to run once; delete db/honeychain.db to reseed)
npm start         # runs on http://localhost:4000

# 2. Frontend (separate terminal)
cd frontend
npm install
npm run dev       # runs on http://localhost:5173, proxies /api to :4000
```

> **Windows PowerShell users:** run each line separately (PowerShell doesn't chain
> commands with `&&` the way bash does).

Open http://localhost:5173.

You'll see an `ExperimentalWarning: SQLite is an experimental feature` line when the
backend starts — that's expected and harmless, just Node flagging that `node:sqlite`
is still evolving upstream.

### Running the backend tests

```bash
cd backend
npm test
```

Runs 21 tests (`node --test`, no extra dependencies) covering: the batch state
machine's transition rules, append-only ledger enforcement, tamper detection via
the hash-chain, and full HTTP integration tests against the real Express app
(out-of-order requests, quarantine blocking, and the happy path end to end). Tests
use an isolated SQLite file under `backend/test/`, never the dev/demo database.

## Demo script (the "hero workflow")

1. **Beekeeper** tab → open hive `H-001` (Healthy) or `H-006` (Critical) → show the
   AI health score, yield prediction, and sensor readings. Try the "Simulate:
   Critical" button live to show the score react in real time.
2. Click **Record Harvest** on a hive → creates a batch, writes `HARVEST_RECORDED`
   and `BATCH_CREATED` events to the ledger.
3. **Processing / Lab** tab → select the new batch → walk it through
   Received → Quality Test (Pass, or **Force Fail** to show quarantine) →
   Processed → Package & Activate QR. Each step is a real ledger event, visible in
   the journey view with truncated hashes. Download the **PDF certificate** for
   the batch here too.
4. **Consumer Scan** tab → paste the batch code (e.g. `HC-MH-2026-0001`) → shows the
   full verified journey and a live **blockchain integrity check**. Consumers can
   also download their own copy of the certificate from here.
5. **Ledger** tab → the whole system's event history in one globally-ordered
   timeline, across every batch — reinforces that this is one shared ledger, not
   a per-batch log.
6. **Cluster Alerts** tab → register a second beekeeper (via **+ New Beekeeper**
   on the Beekeeper tab) with a hive in a "Critical" simulated profile, then check
   this tab shows flagged hives across *both* beekeepers, sorted worst-first —
   this is the KVIC/cluster-administrator view.
7. **The two-layer tamper-evidence proof** (strongest demo moment — now a two-part story):

   **Part A — the database itself refuses to be tampered with.** `batch_events`
   has `BEFORE UPDATE`/`BEFORE DELETE` triggers that reject any direct edit,
   independent of the application:
   ```bash
   cd backend
   node -e "
   const db = require('./db/db');
   db.prepare(\"UPDATE batch_events SET payload = '{}' WHERE seq = 3\").run();
   "
   ```
   This throws `batch_events is append-only: UPDATE is not permitted` — the edit
   never happens.

   **Part B — even if that protection were bypassed, the hash-chain still catches it.**
   Simulate an attacker with elevated DB access who disables the trigger first:
   ```bash
   cd backend
   node -e "
   const db = require('./db/db');
   db.exec('DROP TRIGGER IF EXISTS trg_batch_events_no_update');
   db.prepare(\"UPDATE batch_events SET payload = '{\\\"tampered\\\":true}' WHERE seq = 3\").run();
   "
   ```
   Now re-run the consumer verify or the Ledger tab — it will name the exact
   broken event, because the hash-chain is a second, independent line of
   defense that doesn't rely on the trigger being intact.

## Feature list (as of this version)

| Feature | Where |
|---|---|
| Hive registration + simulated IoT sensors | Beekeeper tab |
| AI health score + yield prediction | Beekeeper tab → hive detail |
| Harvest recording → batch creation (validates hive/beekeeper exist) | Beekeeper tab → hive detail |
| Batch pipeline with **server-side state-order enforcement** | Processing / Lab tab |
| Hash-chained, **append-only** (DB triggers) ledger with live tamper-evidence check | Processing / Lab, Ledger, Consumer Scan tabs |
| QR generation + consumer verification | Processing / Lab → Consumer Scan tabs |
| Downloadable PDF certificate of provenance | Processing / Lab tab and Consumer Scan tab |
| Global ledger explorer (all events, all batches, one timeline) | Ledger tab |
| Cross-hive cluster alerts (flagged hives across all beekeepers) | Cluster Alerts tab |
| Beekeeper registration + switching | Beekeeper tab (top-right) |
| Automated tests (`npm test`) covering state enforcement + tamper detection | `backend/test/` |

## Security & scope tradeoffs (decisions, not oversights)

These are deliberate MVP-scope calls, documented here so they read as
decisions if a judge asks, not as things we forgot:

| Not included | Why | What we'd add for production |
|---|---|---|
| Authentication / RBAC | Out of scope per `mvp.txt` — a hackathon demo doesn't need login walls to prove the traceability concept | Real beekeeper/lab/admin accounts with role-scoped permissions (the actor × permission matrix sketched in `deep-search_honeyChain.txt` §24) |
| Rate limiting / HTTPS | Local demo only, no public-internet exposure | Standard API gateway concerns for a real deployment |
| SQLite instead of Postgres | Zero-setup, zero native compilation (see the Windows `better-sqlite3` saga in git history) | Postgres for real concurrent multi-cluster write load |
| No batch split/merge genealogy | Deliberately trimmed from `mvp.txt`'s scope | Schema and event vocabulary already anticipate it (see `architecture.md` §9) |

What **is** enforced, despite the above: server-side state-order validation
(you cannot skip pipeline steps via a direct API call, only via the UI), DB-level
append-only protection on the ledger, foreign-key referential integrity, and
input validation that hive/beekeeper IDs actually exist before a harvest is
recorded.

## What's deliberately out of scope for this MVP

See `mvp.txt` for the full reasoning. Not built: real blockchain network, FPO/market
layer, real lab integration, Madhukranti/KVIC API integration, multi-role auth,
batch split/merge genealogy, trained ML disease models, real IoT hardware (a
simulation mode stands in). The data model and event schema are designed so these
can be added later without a rewrite.
