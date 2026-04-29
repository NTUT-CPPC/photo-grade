# AGENTS.md

## Commit Discipline (MUST)

Every time `npm test` or `npm run build` passes for a self-contained change, immediately run `git commit` for the files you changed before producing the final assistant message. Do not wait for the user to ask. Do not batch unrelated changes into one commit.

What counts as a segment:

- A bug fix + its regression test.
- A single feature module (template service, one route, one schema migration).
- A docs-only change.
- A refactor that leaves the test suite green.

If `git status` shows files you did not modify, leave them alone — only stage files this session touched. If a single segment legitimately spans multiple files, commit them together; otherwise prefer one commit per segment.

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
- [x] Scoring rules 支援超過三位評審：第四位起使用 `複評4`、`決評美感4` 這類欄位。
- [x] Admin 評審設定改為草稿編輯，需按 `儲存` 才寫回，並支援拖曳排序。
- [x] Score 頁面改為使用完整評審名單產生欄位，不再忽略第三位之後的評審。
- [x] 後端新增 `PUT /api/admin/judges` 以一次儲存評審名單與排序。
- [x] 匯入格式新增可空白 `編號` 欄位；空白時用資料列順序自動編號。
- [x] 匯入作品代碼固定加 `a/b` 後綴：單張也會是 `123a`，兩張為 `123a`、`123b`。
- [x] AGENTS 補上「完成後測試與檢查策略」與「當前環境容器重啟套用變更」操作指引。
- [x] Desktop 左右分割版面下，`exif-table` 預設貼資訊欄底；`photo-details` 太多時改回正常文流並隨 `info-scroll` 捲動。
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
  - `b86f9c8 feat: add admin judge management and import guidance ui`
  - `fd0782e feat: support scoring fields beyond three judges`
  - `a97db82 feat: add bulk judge ordering api`
  - `c8e50df feat: add sortable judge settings and dynamic score fields`
  - `1f6b692 fix: load all configured judges in score page`
  - `26f95a0 feat: add optional submission numbering for imports`
- [x] Basic Auth 帳密簡化為單一 `AUTH_USERNAME`/`AUTH_PASSWORD`，移除 host/score/admin 三組。
- [x] 任何成功登入皆可使用 `/host`、`/score`、`/admin`，不再做角色分流。
- [x] 加入 OIDC Authorization Code (PKCE) 登入；以 `AUTH_MODE=basic|oidc` 切換。
- [x] OIDC 模式使用 `express-session` + `connect-redis`（共用 `REDIS_URL`）；Socket.IO handshake 也共用 session。
- [x] 前端 TopNav 依 `/api/runtime-config` 回傳的 `authMode` 切換 Login / Logout 行為。
- [x] README 新增「登入模式 (Auth)」段落，列出 Basic / OIDC 環境變數與常見 OP 設定提示。
- [x] HEIC 上傳於 import 時自動轉 JPEG（`heic-convert`），原 HEIC 檔案以 JPEG 取代寫入 originals。
- [x] Admin import 改為單一檔案 picker + drag-and-drop；dry-run details 摺疊顯示。
- [x] `tmp/` 加入 `.gitignore`，repo URL 更新為 `NTUT-CPPC/photo-grade`。
- [x] `ImportBatch` schema 加 `processedCount` / `totalCount`；import-service 每處理完一張即時回寫 DB。
- [x] Progress endpoint 改回真實 `done/total`，message 形如 `PROCESSING 59/268`。
- [x] Worker offline 偵測：`/api/admin/import/progress/:id` 與 `/confirm` 用 `queue.getWorkers()` 檢查，回 `workerOnline` 給前端，UI 顯示中文警告與 `docker compose up -d worker` 指引。
- [x] Console log 加 prefix（`[queue]`、`[worker]`、`[import]`、`[media]`、`[admin]`），含 job lifecycle、每張下載大小/時間/HEIC 轉檔。
- [x] BullMQ 自訂 `jobId` 不能含 `:`，改用 `import-${batchId}` 確保 dedup 同時不踩 BullMQ 限制。
- [x] Confirm endpoint 改成「先 enqueue 再 update DB」，避免 enqueue 失敗時 DB 卡在錯誤的 QUEUED 狀態。
- [x] 新增 `GET /api/admin/imports/active` 回最近一筆 DRY_RUN/QUEUED/PROCESSING batch（含轉好的 dryRun），admin 頁 mount 時 hydrate，reload 不再丟狀態。
- [x] 新增 `GET /api/admin/queue/status` 回 BullMQ counts/workers/active/wait/failed jobs，不必 docker logs 就能診斷 queue。
- [x] Admin 頁選檔即自動 dry-run；用 `AbortController` 中斷舊 fetch，移除手動「Dry run」按鈕。
- [x] Admin 頁拆 `dryRunBusy` / `confirmBusy`；dry-run errors 時 Confirm disabled 並顯示原因。
- [x] Admin progress panel 顯示批次檔名 + 相對時間；完成或非 worker-offline 錯誤時顯示「Start new import」重設。
- [x] Compose 對外 port 改為僅使用 `PORT` 變數（移除 `APP_PORT`），避免 host/container port 設定分離造成誤配。
- [x] Synology 佈署預設改為本地 `BUILD_CONTEXT=.`，避免 remote git context 在建置器環境缺 `git` 造成 build 失敗；Dockerfile 同步補齊跨發行版 `git` 安裝。
- [x] 新增 Synology 純 compose 部署模式：`app/worker` 改用可設定 image（`APP_IMAGE`/`WORKER_IMAGE`），不再依賴遠端 build context 與本地 Dockerfile。
- [x] 新增 GitHub Actions `publish-image.yml`：push `main`/`v*` tag 或手動觸發時，自動 build 並發布 GHCR image（`ghcr.io/<repo_owner>/photo-grade`）。

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
- [x] 驗證 `PUT /api/admin/judges` 可保存評審排序與新增項目。
- [x] 驗證四位以上評審時，Score 頁會顯示第四位以後的評分欄位。
- [x] 驗證 `複評4` 可通過後端分數驗證並寫入 DB。
- [x] 驗證匯入 normalization 會產出 `123a`、`123b` 與空白編號 fallback `2a`。
- [x] Backend foundations for new features: 初評過半門檻、複評 top 60、隨機/順序排序、決評切點 override、mode preview、新增 ordering API。
- [ ] Fine tuning：補更完整的 admin import history / sheet sync retry UI。
- [ ] Fine tuning：針對多作品資料做更完整的 host 切換與 score/view 同步瀏覽器測試。
- [ ] Fine tuning：補 mobile screenshot 檢查與 UI 細節修整。

### Known Environment Notes

- Docker Desktop 已啟動；第一次容器實跑發現 runner image 漏複製 workspace-local dependencies，app/worker 找不到 `csv-parse`。已更新 Dockerfile 並重建成功。
- Browser smoke 發現 server 在 npm workspace cwd 下找不到 `apps/web/dist`；已改用 `import.meta.url` 推算 repo root，Docker 重建後已驗證。
- Browser Basic Auth smoke 使用 `http://user:password@localhost:8080/...` 時會讓相對 fetch 解析到含 userinfo URL；前端 API client 已改用 `window.location.origin` 產生乾淨 same-origin absolute URL。
- Google Sheet 未啟用時，score 仍會成功寫 DB；outbox 保持 pending/retry，score 狀態會標成 `FAILED` 並記錄原因，避免現場評分被外部同步阻塞。
- BullMQ 自訂 `jobId` 不能含 `:`，會 throw `Custom Id cannot contain :`；目前用 `import-${batchId}`。任何新增 queue 用法都要避開冒號。
- Worker concurrency 預設 1：多筆 import 排隊跑，新 batch 在前一個完成前停在 `QUEUED`。前端 `workerOnline: true` 不代表立刻會被處理，只代表有 worker 連著。
- 排隊卡住時先打 `GET /api/admin/queue/status`（auth required）看 `counts.active/wait/failed`、`active[].data` 跟 worker 列表；DB 顯示 `QUEUED` 但 BullMQ `active+wait` 都 0 代表 enqueue 沒成功（之前的 colon jobId bug 就是這種症狀）。
- 路由順序：`/api/admin/imports/active` 必須宣告在 `/api/admin/imports/:id` catch-all 之前，否則會被當成 `id="active"` 去 `findUniqueOrThrow`。
- `processImportBatch` 開頭會把 `processedCount` 重設為 0，所以 worker 中途被 SIGKILL 後 BullMQ retry 整個 job 時，UI 進度會看到回到 0 — 這是正確行為，不是 regression。
- Reviewer subagent 受 usage limit 影響未完成；主 agent 需要自行做最終 review。
- `node_modules`、build output、`data` 都是 ignored，不應提交。
- 初評 pass 門檻為 `Math.ceil(judgeCount/2)`，於 `score-service.recomputeWorkDerivedScores` 在每次 score 寫入時依當下 `prisma.judge.count()` 重算。已知限制：當管理者於評審清單變動（新增/刪除）後，先前已寫入的 `Work.initialPassed` 不會自動重算，要等到該作品下一次有 score 寫入才會更新。需要時可手動觸發 score upsert 或之後加 admin reflow API。
- `OrderingState` 的 `shuffleOrder` 只在 admin `setDefaultMode("shuffle")` 或 `regenerateShuffle()` 才重洗；admin 切回 sequential 不會清掉，方便 host 即時切換回 shuffle 用同一份順序。新增/刪除 `Work` 後若想保留新作品也納入隨機，要 admin 觸發 regenerate。

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

`AUTH_MODE` 切換登入機制：

- `basic`（預設）：HTTP Basic Auth，比對單一 `AUTH_USERNAME`/`AUTH_PASSWORD`。
- `oidc`：OpenID Connect Authorization Code (PKCE) flow；session 由 `express-session` + `connect-redis` 管理，cookie 名稱 `pg.sid`。Socket.IO 共用同一個 session。

任何成功登入都允許使用所有受保護介面（host、score、admin），沒有角色限制。

公開路由：

- `/view`、`/`、`/api/health`、`/api/runtime-config`、`/api/works*`、`/api/items`、`/api/judges`、`/api/scores/:workKey`、`/api/host/state`（GET）、`/api/sync/*`（GET）、`/media/*`。
- `GET /auth/login`、`GET /auth/callback`：OIDC 模式下處理登入流程。
- `GET /api/auth/me`：回 `{ authenticated, mode, user? }` 給前端判斷。
- `POST /auth/logout`：清 session（OIDC 模式會嘗試 redirect 到 OP `end_session_endpoint`）。

需要登入的路由（一律走 `requireAuth()`）：

- `/host`、`/score`、`/admin`（HTML）。
- `POST /api/scores`、`POST /submit_score`。
- `POST /api/host/state`、`POST /api/sync/idx|/set_idx`、`POST /api/sync/mode|/set_mode`。
- `POST /api/admin/*`、`GET /api/admin/*`、`POST /api/sheet-sync/drain`。

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
- 複評：`複評一`、`複評二`、`複評三`，第四位起為 `複評4`、`複評5`...，integer 3-5。
- 決評：
  - `決評美感一/二/三`，第四位起為 `決評美感4`、`決評美感5`...
  - `決評故事一/二/三`，第四位起為 `決評故事4`、`決評故事5`...
  - `決評創意一/二/三`，第四位起為 `決評創意4`、`決評創意5`...
  - integer 3-5。

Filtering:

- Initial list: all works. `initialPassed = (initial votes >= ceil(judgeCount / 2))`，過半（含一半）即通過。
- Secondary list: `Work.initialPassed`。
- Final list: top 60 by `Work.secondaryTotal`，含切點 ties overflow。`PresentationState.finalCutoff` 可由 host 透過 `POST /api/host/state` 暫時覆寫（1..1000，預設 60）。`work-service.listWorks("final")` 在沒帶 `topN` 時讀取 `PresentationState.finalCutoff`。

## Import Format

Support both old Google Form headers and normalized headers.

Examples:

- `編號`, `投稿編號`, or `作品編號`; optional. Blank values fall back to row order.
- `作品1 名稱` or `作品1_名稱`
- `作品1 檔案` or `作品1_檔案`
- `作品1 創作理念` or `作品1_創作理念`
- Same pattern for work 2.
- `作者`, `姓名`, or `別稱`
- `電子郵件地址`, `電子郵件`, or `Email`

Work 2 is optional if its file URL is blank.

Work codes are derived from the submission number plus a work suffix: work 1 is `a`, work 2 is `b`. A single-work submission still gets `a` (for example `123a`) so the visible code does not reveal whether there was a second submission. If `編號` is blank, use row order as the base number.

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

## Post-Change Test And Check Strategy

每次完成一個功能段落，至少執行以下分層檢查，並在提交前確認結果合理。

1. Fast static checks:
   - `npm run build`
   - `npm test`
2. Local runtime checks (non-Docker):
   - `npm run dev` 或對應 server/worker 啟動命令可正常啟動。
   - `GET /api/health` 回 `200`。
3. Docker checks (目標環境):
   - `docker compose up --build -d`
   - `docker compose ps` 確認 `app`、`worker`、`postgres`、`redis` 都是 `running`。
   - `docker compose logs --tail=200 app worker` 無持續性 crash loop。
4. Auth and route checks:
   - `/view` 可直接開啟。
   - `/host`、`/score`、`/admin` 未登入時是 `401`。
5. Core flow smoke checks:
   - Admin 匯入 dry-run/confirm 可走通。
   - Host 切換可同步到 score/view。
   - Score 送分可寫入 DB 並觸發即時事件。
6. Data placement checks:
   - 非 DB 可變檔案只落在 `DATA_DIR`（Docker 預設 `/data`，host 對應 `./data`）。
   - PostgreSQL 僅在 `postgres-data` volume。

建議提交訊息中附上本段已完成的檢查類型（例如 build/test/docker smoke）。

## Docker Restart Guide (Current Dev Environment)

目標環境是 Docker，程式變更後用以下方式套用。

1. 快速套用 app/worker 變更（保留 DB/Redis）:
   - `docker compose up --build -d app worker`
2. 完整重啟全部服務（需要重拉起整組容器）:
   - `docker compose down`
   - `docker compose up --build -d`
3. 檢查狀態:
   - `docker compose ps`
   - `docker compose logs --tail=200 app worker`
4. 常用健康檢查:
   - `curl http://localhost:8080/api/health`
   - 瀏覽器開啟 `http://localhost:8080/view`

注意:
- 不要用 `docker compose down -v`，除非明確要刪除 DB volume。
- `./data` 是持久化資料；清理前先確認是否需要備份。

## Development Rules For Future Agents

- Keep commits small and named by behavior.
- 每完成一個可驗證段落就提交一次 commit，避免累積過大未提交改動。
- Update `Progress` in this file before and after major work segments.
- 維護環境變數時，不能只改 `.env`/`.env.example`：必須同步檢查 `docker-compose.yml` 的 `${VAR:-default}` 是否有對應、名稱是否一致、預設值是否合理（含 Synology 這類無法建立 `.env` 的 UI 部署情境）。
- 每次調整 env 相關設定後，至少執行一次變數對照：`.env.example` 中的變數應可在 `docker-compose.yml` 覆蓋，compose 使用到的變數也應在 `.env.example` 有文件化（純說明字串如 `${VAR:-default}` 註解示意除外）。
- Do not create a second backend package or schema. Use `apps/server`.
- Do not write runtime files outside `DATA_DIR`.
- Do not commit `.env`, `data`, `node_modules`, or build artifacts.
- Prefer extending `packages/shared` for cross-client contracts.
- Keep Google Sheet sync non-blocking.
- If Docker is unavailable, still run `npm run build`, `npm test`, `npm audit --audit-level=moderate`, and `docker compose config`.
- When Docker is available, run `docker compose up --build -d` and inspect logs before claiming deployment works.
- Import / queue 相關問題優先查 `GET /api/admin/queue/status`（auth required）對照 DB `ImportBatch.status`：DB 是 QUEUED 但 BullMQ 看不到 active/wait job 代表 enqueue 失敗。Worker 處理流程的 `[queue]/[worker]/[import]/[media]` log prefix 可以一路追到單張下載時間。
- 改 `apps/server/src/queue.ts` 加新 BullMQ job 時，jobId 不要含 `:`（BullMQ 會 throw）；現有 producer 都共用 `queue.add` 的 default options，新增 helper 請保持一致。
- 在 `apps/server/src/index.ts` 新增 `/api/admin/imports/...` 路由時，注意已有 `/api/admin/imports/:id` catch-all，固定字串路由（如 `/api/admin/imports/active`）必須宣告在 `:id` route 之前，否則會被當作 `id="active"` 去 `findUniqueOrThrow`。
