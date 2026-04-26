# AGENTS.md

## Project Purpose

Photo Grade 是 Docker-first、可重用的攝影作品評分系統。它取代 `.codex/oldprojects` 內的 Flask 臨時系統，目標是讓一場攝影徵件活動可以從 Google 表單匯出的 CSV/XLSX 開始，完成作品下載、metadata 保存、現場主持同步、評審瀏覽、計分、Google Sheet 同步與後台管理。

舊系統的核心概念必須保留：

- 主持機器控制目前作品與評分階段。
- 計分機器可自由瀏覽，但主持切換時會同步。
- 瀏覽機器給評審看，可自由瀏覽，但主持切換時會同步。
- 初評、複評、決評有不同評分欄位與篩選規則。

新系統的核心差異：

- PostgreSQL 是正式資料來源。
- Google Sheet 是非同步同步目標，不是現場評分的 source of truth。
- Socket.IO 取代舊系統輪詢同步。
- 所有非 DB 可變檔案都放在 `DATA_DIR`，Docker 預設 `/data`，compose 掛載為 `./data:/data`。

## Progress

請後續 agent 每完成一個可驗證工作段就更新這個清單，並同步建立清楚 commit。

### Done

- [x] 建立 npm workspaces monorepo。
- [x] 建立 `apps/server` Express + TypeScript 後端。
- [x] 建立 `apps/web` Vite + React + TypeScript 前端。
- [x] 建立 `apps/worker` BullMQ worker 入口。
- [x] 建立 `packages/shared` 共用 types、評分規則、header alias、Google Drive URL parser。
- [x] 建立 Prisma schema：`Work`、`Asset`、`Score`、`PresentationState`、`SheetSyncOutbox`、`ImportBatch`。
- [x] 建立 Dockerfile 與 `docker-compose.yml`，包含 app、worker、postgres、redis。
- [x] 將非 DB runtime 檔案統一到 `/data`，compose 掛載 `./data:/data`；PostgreSQL 使用 `postgres-data` volume。
- [x] 建立 `.env.example`，包含 DB、Redis、Basic Auth、Google Sheet、DATA_DIR。
- [x] 實作 HTTP Basic Auth：`/host`、`/score`、`/admin` 需要登入；`/view` 公開。
- [x] 實作 CSV/XLSX 匯入 dry-run，Excel 只讀第一個 worksheet。
- [x] 實作舊 Google 表單 header alias normalization。
- [x] 實作公開 Google Drive / 公開 URL 下載 helper。
- [x] 實作 originals、previews、thumbnails、metadata 寫入 DATA_DIR 子目錄。
- [x] 實作 ExifTool metadata JSON 與 sharp preview/thumbnail。
- [x] 實作初評、複評、決評評分欄位與分數驗證。
- [x] 實作 PresentationState 與 Socket.IO 同步事件。
- [x] 實作 score submit 寫 DB、廣播 score notification、建立 SheetSyncOutbox。
- [x] 實作 Google Sheet 非同步同步 worker。
- [x] 建立 README，包含 Docker 啟動、data 目錄、匯入格式與 Google Sheet API/service account 指引。
- [x] 移除重複的 `packages/backend` scaffold，保留 `apps/server` 作為唯一後端。
- [x] `npm run build` 通過。
- [x] `npm test` 通過。
- [x] `npm audit --audit-level=moderate` 通過。
- [x] `docker compose config` 通過。
- [x] 本機 HTTP smoke：`/api/health=200`、`/view=200`、`/host=401`。
- [x] Docker 實跑：app、worker、postgres、redis 都能啟動。
- [x] Docker HTTP smoke：`/api/health=200`、`/view=200`、`/host=401`、`/admin=401`。
- [x] Docker `./data` 子目錄自動建立。
- [x] Docker browser smoke：`/view`、`/host`、`/score`、`/admin` 主要頁面可開啟，能載入 smoke 測試作品。
- [x] 修正 Docker runtime 靜態前端路徑，server 從 compiled `import.meta.url` 推算 repo root。
- [x] 修正 Basic Auth userinfo URL 下的前端 API URL 解析，避免 fetch 對含帳密 URL 失敗。
- [x] 匯入 sample CSV，確認 dry-run、confirm、worker 下載與影像處理 flow。
- [x] 確認 `/data/originals`、`/data/previews`、`/data/thumbnails`、`/data/metadata` 產出 smoke 檔案。
- [x] 確認 score submit 寫入 DB，host 頁可顯示目前分數。
- [x] 確認 Socket.IO `state:changed` 與 `score:changed` 在 REST 寫入後會廣播。
- [x] 修正 Google Sheet sync 未設定時 score 狀態卡在 `PROCESSING` 的問題；現在會標記 `FAILED` 並保留 outbox retry。
- [x] Top nav 改為折疊式導覽：`/view` 預設顯示 `View + Login`，不直接露出受保護路由。
- [x] Host 模式 top nav dropdown 增加 View 入口 QR code。
- [x] 新增 runtime 設定 `PUBLIC_ENTRY_URL` 與 `/api/runtime-config`，讓入口網址可由 `.env` 控制。
- [x] Top nav 改為頁面內佔位，不再固定懸浮遮擋主畫面。
- [x] Top nav 重新設計為極簡單按鈕（`Login/Menu`）+ dropdown，縮小常駐佔用空間。
- [x] Admin 頁面新增評審名單管理（新增/刪除評審名字）。
- [x] Admin 頁面新增匯入範本下載（CSV/XLSX）。
- [x] Dry run / Confirm 按鈕補上 tooltip 說明。
- [x] Score 頁面改為從後端評審名單載入前三位顯示名稱。
- [x] 後端新增 `/api/judges` 與 admin judges CRUD API。
- [x] 後端新增 `/api/admin/import/template.csv`、`/api/admin/import/template.xlsx`。
- [x] Commit history 已建立：
  - `7b2017e chore: scaffold docker node judging app`
  - `0188caf feat: integrate import media scoring frontend`
  - `72a3dee chore: harden runtime integration`
  - `86e0dcc chore: prune duplicate backend workspace`
  - `5b3ec4c docs: add agent progress ledger`
  - `aa4f4f1 fix: include workspace dependencies in docker image`
  - `5bd1270 feat: add configurable entry url and host QR nav`
  - `8714c2c refactor: redesign compact top nav dropdown`
  - `065c8ce feat: add judge admin api and import template downloads`

### In Progress / Next

- [x] Docker Desktop 啟動後，執行 `docker compose up --build -d` 實際容器驗證。
- [x] 在 Docker 環境驗證 app/worker/postgres/redis 都能啟動。
- [x] 驗證 `./data` 自動建立所有子目錄。
- [x] 用瀏覽器檢查 `/view`、`/host`、`/score`、`/admin` 主要 UI。
- [x] 匯入 sample CSV，確認 dry-run 與 confirm flow。
- [x] 確認 worker 下載作品、產生 original/preview/thumbnail/metadata。
- [x] 確認 host state API 可寫入並廣播目前作品狀態。
- [x] 確認 score 送分後 host 顯示分數，DB 有分數，Socket.IO 有廣播，Sheet sync disabled 狀態合理。
- [x] 驗證 `PUBLIC_ENTRY_URL` 可由 `/api/runtime-config` 讀取並反映在 Host QR 入口連結。
- [x] 驗證 judges API 可新增/刪除評審，且列表順序可用。
- [x] 驗證 Admin UI 有評審管理區、範本下載按鈕與 dry-run/confirm tooltip。
- [ ] Fine tuning：補更完整的 admin import history / sheet sync retry UI。
- [ ] Fine tuning：針對多作品資料做更完整的 host 切換與 score/view 同步瀏覽器測試。
- [ ] Fine tuning：補 mobile screenshot 檢查與 UI 細節修整。

### Known Environment Notes

- Docker Desktop 已啟動；第一次容器實跑發現 runner image 漏複製 workspace-local dependencies，app/worker 找不到 `csv-parse`。已更新 Dockerfile 並重建成功。
- Browser smoke 發現 server 在 npm workspace cwd 下找不到 `apps/web/dist`；已改用 `import.meta.url` 推算 repo root，Docker 重建後已驗證。
- Browser Basic Auth smoke 使用 `http://user:password@localhost:8080/...` 時會讓相對 fetch 解析到含 userinfo URL；前端 API client 已改用 `window.location.origin` 產生乾淨 same-origin absolute URL。
- Google Sheet 未啟用時，score 仍會成功寫 DB；outbox 保持 pending/retry，score 狀態會標成 `FAILED` 並記錄原因，避免現場評分被外部同步阻塞。
- Reviewer subagent 受 usage limit 影響未完成；主 agent 需要自行做最終 review。
- `node_modules`、build output、`data` 都是 ignored，不應提交。

## Architecture

### Workspaces

- `apps/server`
  - Express API。
  - Socket.IO server。
  - Prisma client。
  - Basic Auth middleware。
  - Media route `/media/:kind/:file`。
  - Static web serving for built React app.
- `apps/web`
  - React/Vite frontend。
  - Routes are path-based in `App.tsx`:
    - `/admin`
    - `/host`
    - `/score`
    - `/view`
  - Uses old-system-inspired dark two-pane layout.
- `apps/worker`
  - Imports server worker entry.
  - Runs BullMQ jobs for import and sheet sync.
- `packages/shared`
  - TypeScript types.
  - Scoring rules.
  - CSV/XLSX header aliases.
  - Google Drive public URL parser.

### Data Source Policy

PostgreSQL is authoritative:

- Works, assets, scores, imports, presentation state, sheet sync outbox all live in DB.
- Google Sheet sync is async and retryable.
- Google Sheet failure must never block live scoring.

### Runtime Data Rule

All non-DB mutable files must be written under `DATA_DIR`.

Docker defaults:

- Container path: `/data`
- Host bind mount: `./data:/data`

Allowed subdirectories:

- `/data/imports`: uploaded CSV/XLSX files.
- `/data/originals`: downloaded original submissions, never overwrite destructively.
- `/data/previews`: web display JPEGs.
- `/data/thumbnails`: compact images for score/list pages.
- `/data/metadata`: ExifTool JSON.
- `/data/logs`: optional runtime logs.
- `/data/exports`: future exports.
- `/data/secrets`: optional service account JSON; never commit.

Use `assertInsideDataDir()` before writing or reading runtime paths derived from user/job input.

## Core Flow

1. Admin uploads CSV/XLSX.
2. Server stores upload in `/data/imports`.
3. Server parses CSV or first worksheet of XLSX.
4. Server validates headers and normalizes rows into `NormalizedWorkInput`.
5. Admin confirms dry-run.
6. Server queues BullMQ import job.
7. Worker upserts `Work`.
8. Worker downloads public Google Drive/public URL file to `/data/originals`.
9. Worker extracts ExifTool JSON to `/data/metadata`.
10. Worker creates preview and thumbnail via sharp.
11. Host controls current mode/work through REST and Socket.IO events.
12. Score page submits scores through REST.
13. Server validates score fields/ranges, writes DB, broadcasts notifications, and creates outbox items.
14. Worker syncs pending score outbox items to Google Sheet if enabled.

## Public Routes And Auth

Initial auth mode is HTTP Basic Auth only.

- `/view`: public.
- `/host`: host or admin.
- `/score`: score or admin.
- `/admin`: admin.
- `POST /api/scores`: score or admin.
- `POST /api/host/state`: host or admin.
- `POST /api/sync/*`: host or admin.
- `POST /api/admin/*`: admin.
- `POST /api/sheet-sync/drain`: admin.

Socket.IO:

- Read/listen events are public enough for `/view`.
- State-changing host events should require host/admin authorization when possible.
- Score submit over socket should require score/admin authorization.
- Browser clients mainly use REST for state-changing actions because HTTP Basic Auth is browser-managed there.

## Scoring Rules

Canonical modes:

- `initial`: 初評。
- `secondary`: 複評。
- `final`: 決評。

Fields:

- 初評：`初評`，integer 0-3。
- 複評：`複評一`、`複評二`、`複評三`，integer 3-5。
- 決評：
  - `決評美感一/二/三`
  - `決評故事一/二/三`
  - `決評創意一/二/三`
  - integer 3-5。

Filtering:

- Initial list: all works.
- Secondary list: `Work.initialPassed`.
- Final list: top 30 by `Work.secondaryTotal`, including ties at cutoff.

## Import Format

Support both old Google Form headers and normalized headers.

Examples:

- `作品1 名稱` or `作品1_名稱`
- `作品1 檔案` or `作品1_檔案`
- `作品1 創作理念` or `作品1_創作理念`
- Same pattern for work 2.
- `作者`, `姓名`, or `別稱`
- `電子郵件地址`, `電子郵件`, or `Email`

Work 2 is optional if its file URL is blank.

Current MVP only supports public Google Drive links and public URLs. Do not implement private Drive/OAuth flow unless explicitly requested later.

## Google Sheet Sync

`.env` controls Sheet sync:

- `GOOGLE_SHEETS_ENABLED`
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_SERVICE_ACCOUNT_FILE`

Sync behavior:

- Score write creates `SheetSyncOutbox`.
- Worker drains outbox.
- If Sheet sync is disabled/misconfigured, live scoring still succeeds.
- Sheet errors should set score/outbox status for retry and admin visibility.

## Frontend Guidance

The UI should stay close to the old project:

- Dark background.
- Photo-first two-pane composition.
- Right-side metadata/control/score area.
- Minimal text, no emoji-heavy UI.
- Buttons should use icons where practical.
- Host/score/view support navigation, jump, rotate.
- Score/view may browse freely but follow host when host sync changes.

After meaningful frontend changes:

1. Build with `npm run build`.
2. Run app.
3. Use browser to inspect `/view`, `/host`, `/score`, `/admin`.
4. Check mobile-ish narrow viewport if layout changes are substantial.

## Development Rules For Future Agents

- Keep commits small and named by behavior.
- 每完成一個可驗證段落就提交一次 commit，避免累積過大未提交改動。
- Update `Progress` in this file before and after major work segments.
- Do not create a second backend package or schema. Use `apps/server`.
- Do not write runtime files outside `DATA_DIR`.
- Do not commit `.env`, `data`, `node_modules`, or build artifacts.
- Prefer extending `packages/shared` for cross-client contracts.
- Keep Google Sheet sync non-blocking.
- If Docker is unavailable, still run `npm run build`, `npm test`, `npm audit --audit-level=moderate`, and `docker compose config`.
- When Docker is available, run `docker compose up --build -d` and inspect logs before claiming deployment works.
