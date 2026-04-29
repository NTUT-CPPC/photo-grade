# AGENTS.md

Photo Grade 是一套 Docker-first、可重用的攝影徵件評分系統。本文件是寫給 **代理人（agent）** 的工作守則，內容偏實作細節與專案習慣，假設讀者熟悉 Node.js、TypeScript 與 Docker。**面向使用者的安裝步驟請看 `README.md`，這份檔案不應該被當成入門教材維護。**

> 本檔案的 single source of truth 是「專案目前的實作」，不是流水帳。請避免在這裡累積進度日誌；commit history 與 issue tracker 才是長期紀錄。

---

## 1. 與本專案協作的習慣

### 1.1 Commit cadence（MUST）

每完成一個可驗證的工作段（self-contained change）就立刻 `git commit`，不要等使用者催、也不要把多個無關改動合成一個尾巴 commit。

「一段」的定義：

- bug fix + 對應的 regression test。
- 一個功能模組（一支 service、一條 route、一段 schema migration）。
- 純文件改動。
- 使測試保持綠燈的 refactor。

如果一段需要動到多個檔案，這些檔案一起 commit；但不要把這段以外、現場順便看到的東西也塞進來。`git status` 顯示的非本次相關檔案，**留給原作者/下一個 agent，不要動**。

### 1.2 Plan / Memory / Tasks

- 對於非 trivial 的實作，先用 plan 對齊方向；不要一頭就改。
- 環境設定、跨 session 的事實才寫 memory，**不要把實作細節記到 memory**——那是這份 AGENTS.md 與程式碼的工作。
- 使用 task list 管理當前對話中的工作分段；任務完成立刻 mark complete。

### 1.3 文件分工

- `README.md`：給 **不一定有資訊背景** 的營運/活動主辦人。從 0 起步、要能照著申請第三方金鑰、跑起 Docker compose。
- `AGENTS.md`：給 **後續 agent / 開發者**。實作邏輯、契約、踩雷紀錄。
- `.env.example` 與 `docker-compose.yml`：環境變數的 source of truth。

修 env 相關設定時，**至少同步以下三處**：`.env.example`、`docker-compose.yml` 的 `${VAR:-default}`、與本檔案 §10 的環境變數總表（如有相依文字也要更新 README）。少改一處就會在 Synology 這類「沒有 `.env` 純 UI」部署上失靈。

---

## 2. 專案目標與設計取捨

Photo Grade 取代 `.codex/oldprojects` 內的 Flask 臨時系統。一場攝影徵件活動需要：從 Google 表單匯出 CSV/XLSX → 下載作品 → 保存 metadata → 主持人現場控制 → 評審計分 → Google Sheet 非同步同步 → 後台維運。

**保留自舊系統**：

- 主持機器決定「目前作品」與「目前評分階段」。
- 計分機器、瀏覽機器可自由翻閱；主持切換時會被同步拉回。
- 初評、複評、決評有不同欄位、不同分數區間、不同篩選規則。

**新系統的核心差異**：

- **PostgreSQL 是唯一 source of truth**。Google Sheet 只是非同步同步 *目標*，不是現場評分依據。
- **Socket.IO 取代輪詢**。所有 host 切換、score 寫入都會 broadcast。
- **非 DB 可變檔案一律放 `DATA_DIR`**（Docker 預設 `/data`，host bind mount `./data:/data`）。
- **Google Sheet 失敗永遠不能阻塞現場評分**。寫不上去就把 score / outbox 標 FAILED，繼續工作。

---

## 3. Repository layout

```
apps/
  server/           Express + Socket.IO + Prisma；同時提供靜態前端
    src/
      index.ts            入口；route 集中 + 啟動 server / Socket.IO
      env.ts              zod 驗證的設定（OIDC 模式時 superRefine）
      auth.ts             requireAuth() / Basic Auth 比對
      session.ts          AUTH_MODE=oidc 的 express-session + connect-redis
      oidc.ts             PKCE / issuer discovery / 交換 token / end_session_endpoint
      queue.ts            BullMQ Queue + ioredis connection
      realtime.ts         Socket.IO 事件、widely-broadcasting helpers
      worker-entry.ts     worker process 用同一份 dist
      storage.ts          DATA_DIR 子目錄與 assertInsideDataDir() 防越權
      services/           商業邏輯（import、media、score、sheet 等）
      routes/             Express 子 router（auth-routes、score-routes、state-routes）
    prisma/schema.prisma  資料表
  web/              Vite + React；單一 SPA 檔案根據 path 切頁面
    src/
      App.tsx            極簡 path-based routing（/admin /host /score /view）
      pages/*.tsx        AdminPage / HostPage / ScorePage / ViewPage
      components/*.tsx   PhotoPane / TwoPaneShell / TopNav / ModeSwitchDialog 等
      api/client.ts      REST helper
      api/socket.ts      socket.io-client + 事件訂閱
      state/gallery.ts   依模式串 sockets/REST，host/score/view 都用同一個 hook
  worker/           只有一行：import "@photo-grade/server/worker-entry"
packages/
  shared/           跨 client 共用：types、scoring rules、header alias、Drive URL parser
docker-compose.yml  主要部署入口（Synology 不走 Dockerfile，直接拉 GHCR image）
Dockerfile          deps → builder → runner 三階段；產 GHCR image
.github/workflows/publish-image.yml  push main / v* / 手動觸發 → 推 GHCR
```

每個 workspace 有自己的 `package.json` 與 `dist/`。`apps/worker` 靠 npm workspace 連到 `@photo-grade/server`，所以 server 改完 worker 不需要重新 import — 重 build 就好。

---

## 4. Runtime architecture

```
+----------------+      Socket.IO       +-----------------+
|  Browser /web  | <------------------> |   apps/server   |
+----------------+        REST          | (Express + WS)  |
                                        +--------+--------+
                                                 |
                          BullMQ enqueue ←───────┤
                                                 ▼
                                        +-----------------+
                                        |  apps/worker    |
                                        | (BullMQ Worker) |
                                        +--+---------+----+
                                           |         |
                                       imports     sheet sync
                                       (download   (Google
                                        + sharp     Sheets API)
                                        + heic
                                        + exiftool)
                                           |
                                           ▼
                                   PostgreSQL (authoritative)
                                   Redis (BullMQ + OIDC sessions)
                                   /data (originals/previews/...)
```

容器網路內：app 監聽 `${PORT}`；worker 不開 port；postgres / redis 都是 compose-internal。對外只暴露 app port（compose 設定為 `${PORT}:${PORT}`，已移除舊的 `APP_PORT` 變數）。

`trust proxy = 1`：OIDC callback 與 cookie secure 都依賴 `X-Forwarded-Proto` / `X-Forwarded-Host`。沒有反向代理時要把 `apps/server/src/index.ts` 的 `app.set("trust proxy", 1)` 改回 `false`，否則 client 可以偽造 header 改變 callback URL。

---

## 5. 資料儲存與目錄

### 5.1 DB 是 source of truth

所有持久狀態（works、scores、presentation、ordering、rule config、judges、sheet sync target、sheet outbox、import batches）都在 PostgreSQL。

Prisma 主要 model（`apps/server/prisma/schema.prisma`）：

- `Work` / `Asset`：作品與其 original/preview/thumbnail/metadata 檔案路徑。
- `Score`：unique key `(workId, round, judgeId, field)`，`sheetStatus` 追蹤同步狀態。
- `PresentationState` (id=1)：主持目前狀態 + `finalCutoff` / `secondaryThreshold` overrides。
- `OrderingState` (id=1)：`defaultMode` / `activeMode` / `shuffleOrder`（陣列）。
- `RuleConfig` (id=1)：`defaultFinalTopN` / `defaultSecondaryThreshold`，admin 預設規則。
- `SheetSyncConfig` (id=1)：DB-side sheet target；空時 fallback `GOOGLE_SHEET_ID`。
- `SheetSyncOutbox`：每個 score 寫入會建一筆，對應 BullMQ `sheet-sync` job。
- `ImportBatch`：dry-run 結果以 JSON 存 `dryRunJson`，狀態 `DRY_RUN → QUEUED → PROCESSING → COMPLETED|FAILED|CANCELLED`，`processedCount`/`totalCount` 是 worker 即時回寫。
- `Judge`：admin 維護的評審名單與 `sortOrder`。

Singleton model（id 固定為 1）若不存在，service 會 lazy create，不需要 seed migration。

### 5.2 Non-DB 檔案：`DATA_DIR` 紀律

容器路徑 `/data`；`storage.ts` 預先 mkdir 全部子目錄：

| 目錄 | 用途 |
| --- | --- |
| `imports/` | admin 上傳的 CSV/XLSX 原檔 |
| `originals/` | 下載到的原始作品；HEIC 會原地轉成 JPEG，不刻意保留兩份 |
| `previews/` | sharp 產 2160px JPEG（quality 85, mozjpeg） |
| `thumbnails/` | sharp 產 900px JPEG（quality 78） |
| `metadata/` | （reserved；目前 ExifTool sidecar 是寫到 `originals/<code>.json`） |
| `output/` | 評分匯出與「清除前強制備份」CSV |
| `exports/` | 預留 |
| `secrets/` | service account JSON（**禁止 commit**） |
| `logs/` | 預留 |

**所有寫入路徑都要先過 `assertInsideDataDir()`**。它會 reject `..` 越權與路徑符號鏈。新增需要寫檔的功能務必沿用，不要直接 `fs.writeFile` 任意路徑。

PostgreSQL 與 Redis 各自有 named volume（`postgres-data` / `redis-data`），不在 `./data` 下。備份要分別處理。

---

## 6. Auth model

### 6.1 兩種模式

`AUTH_MODE=basic`（預設）：

- HTTP Basic Auth，比對單一 `AUTH_USERNAME` / `AUTH_PASSWORD`。
- 沒有 session；REST 與 Socket.IO handshake 都讀 `Authorization` header。
- Socket.IO handshake 走 `socket.handshake.headers.authorization`。

`AUTH_MODE=oidc`：

- Authorization Code + PKCE flow（`oidc.ts` 透過 `openid-client`）。
- Session 由 `express-session` + `connect-redis` 管理；cookie 名 `pg.sid`，`httpOnly + sameSite=lax`。`COOKIE_SECURE=auto` 在 `NODE_ENV=production` 下變 secure。
- 為相容 `connect-redis@9` 的 node-redis 介面，`session.ts::createConnectRedisClient()` 把 `set/get/expire/del/mGet/scanIterator` 轉接到 ioredis。**不要改回直接用 node-redis，會踩過去 ioredis 同連線重用的問題**。
- Socket.IO 在 OIDC 模式下重用同一份 session middleware（`io.engine.use(...)`）；handshake 的 cookie 必須對應到含 `user` 的 session。
- `/auth/login` 會把 PKCE state/code_verifier/nonce/returnTo 存進 session，redirect 到 OP；`/auth/callback` 交換 token、把 `claims.sub/name/email/idToken` 存到 `req.session.user`，再 redirect 回 `returnTo`。
- `POST /auth/logout` 會嘗試解析 OP 的 `end_session_endpoint`，連同 `id_token_hint` 與 `OIDC_POST_LOGOUT_REDIRECT_URI` redirect；如果失敗 fallback 到 `/view`。

### 6.2 路由分區

公開（不需登入）：

- `/`、`/view`、`/api/health`、`/api/runtime-config`
- `/api/works*`、`/api/items`、`/api/judges`、`/api/scores/:workKey`
- `/api/host/state`（GET）、`/api/sync/*`（GET）、`/api/ordering`
- `/media/*`（限定 `originals|previews|thumbnails` + 白名單副檔名）
- `/auth/login`、`/auth/callback`（僅 OIDC 模式有意義；basic 模式 `/auth/login` 直接 redirect）
- `GET /api/auth/me`：給前端 TopNav 判斷登入狀態與模式

`requireAuth()`（任一登入成功的使用者都可以進）：

- HTML：`/host`、`/score`、`/admin`
- API（state mutations）：`POST /api/scores`、`POST /submit_score`、`POST /api/host/state`、`POST /api/sync/idx|/set_idx`、`POST /api/sync/mode|/set_mode`、`/api/admin/*`、`POST /api/sheet-sync/drain`、`POST /api/sync/ordering`

OIDC 模式下未登入請求 HTML：`requireAuth()` 會 redirect 到 `/auth/login?returnTo=...`。API 一律回 401 JSON。

**所有受保護介面之間沒有角色分離**——能進 `/host` 就能進 `/admin`。沒有 host-only / score-only / admin-only 細分，這是刻意的，因為現場通常一台機器只開一個 tab。

### 6.3 路由順序陷阱

`/api/admin/imports/:id` 是 catch-all。任何固定字串子路由（如 `/api/admin/imports/active`）必須宣告在 `:id` route **之前**，否則會被當成 `id="active"` 餵給 `findUniqueOrThrow`。新增 admin 路由時請保持這個順序。

---

## 7. Real-time（Socket.IO）

`apps/server/src/realtime.ts` 是廣播中心。事件雙向相容（新名 + 舊名）：

| 觸發 | 廣播事件 | Payload |
| --- | --- | --- |
| host 切作品 / 模式 / cutoff / threshold | `state:changed`、`host:state`、`sync:state`、`sync:idx`、`sync:mode`、`photo:index`、`mode:changed` | `PresentationStatePayload` 子集 |
| score submit | `score:submitted`、`score:notification`、`score:changed`、`score` | `ScoreChangedPayload` |
| ordering 改變（admin or host） | `ordering:changed` | `OrderingStatePayload` |

入站 socket events（皆 `assertSocketAuthenticated`）：

- `host:setState` / `sync:set_idx` / `host:navigate` / `sync:set_mode` / `host:mode`：透過 `setPresentationState()` 更新 DB。
- `score:submit`：走 `normalizeScoreRequest()` → `submitScores()` → 雙重 broadcast（submitted + changed）。

每個事件可選 `ack(payload)` 回傳 `{ ok, data?, error? }`。**新增 socket 事件時請沿用 `handle(ack, action)` 模板，不要用 try/catch 直接吃掉錯誤**。

瀏覽器 client 走 REST 為主、socket 為輔（特別是 Basic 模式：browser 自動帶 Authorization 是給 REST 用的，handshake 不容易帶；REST 寫入後 server 會 broadcast）。

---

## 8. Import pipeline

完整流程：

1. Admin 上傳 CSV/XLSX → multer 寫到 `/data/imports/<timestamp>-<safeName>.<ext>`。
2. `dryRunImport()` 解析（`csv-parse` 或 `read-excel-file`，XLSX 只讀 sheet 1）→ `validateHeaders()` + `normalizeRows()`。
3. 建立 `ImportBatch`（status `DRY_RUN`，`dryRunJson` 存完整結果）。
4. UI 顯示 dry-run；如果 `errors > 0` Confirm 鈕被 disable。
5. Admin 按 Confirm → `cancelActiveImports()` + `wipeAllImportData()`（**先清空現有 works/assets/scores/outbox 與 media 子目錄**）→ `enqueueImport()` → `ImportBatch.status = QUEUED`。
6. Worker 拿到 `import` job → `processImportBatch()`：標 `PROCESSING`、把 `processedCount` 重設 0、依 `IMPORT_ITEM_CONCURRENCY` 開 lane 並行下載/處理。
7. 每張作品：upsert `Work` → `processMediaForWork()`（下載、HEIC→JPEG、ExifTool sidecar、preview/thumbnail）→ `processedCount += 1`。
8. 全部完成 → `COMPLETED`；任一張 throw → 整批 `FAILED`；admin 中途 cancel → 即時偵測並 `CANCELLED` 收工。

### 8.1 Confirm 是「破壞性」操作

按 Confirm 會清空所有 works / assets / scores / outbox 與 media 子目錄——這是有意設計（重新匯入 = 重來一次）。所以前端 Confirm 按鈕一律走過 dry-run 才能按，且 server 端 `confirm` route 先 cancel 所有現存 active batch。**新增 import 入口時不要繞過這層保護**。

### 8.2 BullMQ 規則

- jobId 不能含冒號（`:`）—— BullMQ throw `Custom Id cannot contain :`。匯入用 `import-${batchId}`。
- 預設 `attempts: 2 + exponential 5s`（import）、`3 + 3s`（sheet sync）。
- 整個 worker 的 default concurrency = 1（一次只跑一個 batch）；單 batch 內的並行用 `IMPORT_ITEM_CONCURRENCY`。
- `processedCount` 在 `processImportBatch` 開頭會重設 0，所以 worker SIGKILL 後 BullMQ retry 整個 job 時，UI 進度會看到回到 0——**這是正確行為，不是 regression**。

### 8.3 排隊診斷

匯入卡住先打：

```bash
curl -u admin:pwd http://localhost:8080/api/admin/queue/status
```

回傳 `counts.{wait,active,delayed,failed,completed,paused}`、`workers[]`、`active[]`、`wait[]`、`failed[]`。對照 DB `ImportBatch.status`：

- DB `QUEUED` 但 `active+wait` 都 0 → enqueue 沒成功（過去 colon jobId bug 的徵兆，現在不該發生）。
- `workers[]` 為空 → worker container 沒起來；`/api/admin/import/progress/:id` 與 confirm 會回 `workerOnline: false` 並提示 `docker compose up -d worker`。
- 所有 `[queue]/[worker]/[import]/[media]` console log 都有 prefix，可以從 enqueue 一路追到單張下載時間。

### 8.4 匯入格式（Header alias）

`packages/shared/src/headers.ts` 同時接受「直接欄位」與「舊 Google 表單欄位」。

- 直接版本：`作品名稱` / `作品檔案` / `創作理念` 加 `編號`、`作者`、`電子郵件地址`。
- 舊表單版本：`作品1_名稱`、`作品1_檔案`、`作品1_創作理念`，作品 2 同理（可整段空白略過）。
- 共通欄位：`學校`、`系級`、`學號`、`作者|姓名|別稱`、`電子郵件地址|電子郵件|Email`。
- `編號` 可空：fallback 為資料列順序（1, 2, 3, ...）。
- 作品代碼一律加後綴：work 1 = `a`、work 2 = `b`。單張投稿也是 `<num>a`，看不出有沒有第二張。

`workCode` 的格式 `${submissionCode}${postfix}` 是 sheet sync canonical key——不要改成 `-` 連接，會打壞 Google Sheet 既有資料對應。

---

## 9. Scoring rules

### 9.1 三個階段、評分欄位

| Round | Field 樣式 | 範圍 | 例 |
| --- | --- | --- | --- |
| `initial` | `初評` | integer 0–3 | 初評票數，過半通過 |
| `secondary` | `複評<n>` | integer 3–5 | `複評1` `複評2` `複評3` `複評4`... |
| `final` | `決評美感<n>` / `決評故事<n>` / `決評創意<n>` | integer 3–5 | `決評美感1`... |

`<n>` 是評審 sortOrder 對應序號；超過 3 位評審會自動產 `複評4`、`決評美感4`...，前後端共用 `packages/shared/src/scoring.ts::fieldsForJudgeCount()`。Google Sheet sync 也用同一份 `compareScoreField` 排序（初評 → 複評 1..N → 決評美感 → 決評故事 → 決評創意）。

### 9.2 Initial pass threshold

`Work.initialPassed` 在每次 score 寫入時由 `recomputeWorkDerivedScores()` 重算，門檻優先序：

1. `PresentationState.secondaryThreshold`（host 在切到複評前可在 ModeSwitchDialog 暫時 override）。
2. `RuleConfig.defaultSecondaryThreshold`（admin 設定的場次預設）。
3. `Math.ceil(judgeCount / 2)`（fallback：以目前 `prisma.judge.count()` 算過半）。

當 admin 在 `/api/admin/rule-config` 改 `defaultSecondaryThreshold` 或 host 改 `secondaryThreshold` 時，會呼叫 `recomputeAllInitialPassed()` 把所有已寫入分數的作品 `initialPassed` 重算一次。**新增評審不會自動 reflow**——下一次該作品有新 score 才會更新。需要時呼叫 `recomputeAllInitialPassed()`。

### 9.3 Final cutoff

`listWorks("final")` 取 `secondaryTotal` 排序前 N，**含 ties overflow**：第 N+1 名若分數與第 N 名相同會一起入選。N 取得優先序：

1. `listWorks` 的 `topN` 參數（`previewMode()` 用）。
2. `PresentationState.finalCutoff`（host override）。
3. `RuleConfig.defaultFinalTopN`（admin 設定）。
4. `60`（hard fallback，`work-service.DEFAULT_FINAL_TOP_N`）。

`previewMode()` 會回傳 `count`、`baseCount`、`overflow`，給 host 在切換前看「按目前規則會抓幾張」。

---

## 10. Ordering（順序 / shuffle）

`OrderingState` 一筆 row 控制全場順序：

- `defaultMode`：admin 預設模式（`sequential|shuffle`）。
- `activeMode`：host 目前生效模式。
- `shuffleOrder`：`work.code[]`，僅在 admin `setDefaultMode("shuffle")`、`regenerateShuffle()`、或 host 切到 shuffle 但 `shuffleOrder` 為空時才重洗。
- 切回 `sequential` **不會清掉** `shuffleOrder`，這樣 host 可以隨時切回同一套隨機。
- 新增/刪除 `Work` 不會自動更新 `shuffleOrder`——要納入新作品請 admin 觸發 regenerate。

`work-service.applyOrdering()`：當 `activeMode === "shuffle"` 且 `shuffleOrder` 非空時，依 `shuffleOrder` 重排；不在序內的作品 fallback 到 code 比較。

---

## 11. Google Sheet sync

### 11.1 觸發鏈

每次 `submitScores()`：DB upsert score → 同 transaction 建 `SheetSyncOutbox(scoreId)` → `enqueueSheetSync([scoreIds])` → worker 跑 `processSheetSync()`。

### 11.2 啟用條件

`processSheetSync()` 任一條不符就把 outbox 放回 PENDING（指數 backoff，最多 5 分鐘）並把 score `sheetStatus = FAILED` + `sheetError`：

- `GOOGLE_SHEETS_ENABLED !== true`。
- 沒有 sheet target（DB 的 `SheetSyncConfig` 與 env 的 `GOOGLE_SHEET_ID` 都空）。
- service account 金鑰沒設或讀不到（`GOOGLE_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_SERVICE_ACCOUNT_FILE`）。
- Sheets API 拋例外（權限不足、worksheet 名衝突等）。

**failure 永遠不該 propagate 到現場評分流程**。Score 已經寫進 DB，只是同步 retry 中。

### 11.3 Sheet target 解析

優先序：

1. `SheetSyncConfig`（admin 在 `/admin` 頁設定，可貼分享連結或 raw spreadsheet ID；`parseSpreadsheetId()` 會解析 `/spreadsheets/d/<ID>/` 與 `?id=<ID>`）。
2. env 的 `GOOGLE_SHEET_ID` + `GOOGLE_SHEET_WORKSHEET`。
3. 都無 → `null`，sync 跳過。

Service account email 由 `getServiceAccountEmail()` 從 JSON 的 `client_email` 讀，admin UI 顯示，並在文案上說「請把這個 email 加到試算表的編輯者」。

### 11.4 Header drift handling

`ensureWritableWorksheet()` 對 worksheet 採取以下策略：

- 沒有對應 worksheet → 建一個 + 寫 canonical header。
- worksheet 完全空白 → 直接寫 canonical header。
- header 已包含全部 canonical 欄位（順序可重排、可多出使用者自訂欄位）→ 直接重用。
- header 缺少部分 canonical 欄位 → **保留既有順序與使用者自訂欄位**，把缺少的欄位依 canonical 順序 **追加在最右側**，把擴充後的 header 寫回 row 1。

合成「effective header」的邏輯放在 `sheet-header.ts::computeEffectiveHeader()`（純函式，有單元測試）。所有後續 row 操作都按 effective header 的位置查欄位（而非 canonical 位置），所以 sheet 寫入也保留使用者新增的尾部欄位。

> 從 column-order 自由化開始，**不再因 header 不符而建立新 worksheet**。早期的 `<原名>-YYYYMMDD-HHMMSS` 遷移路徑已移除；`migrated_header` action 也一併刪除。

Canonical header = `[作品編號, 作品連結, ...sortedFields, 最後更新時間]`，sortedFields 走 `compareScoreField`。

### 11.5 Admin 端 UI gating

只有 `GOOGLE_SHEETS_ENABLED=true` 且 service account 金鑰 readable 時，admin 頁才顯示完整的 sheet 設定區。否則改顯示「未啟用」與可展開的快速教學。**修改設定 UI 時要保留這個 gating**——避免在環境根本沒準備好時讓使用者輸入 sharelink，造成困惑。

---

## 12. Media pipeline（worker 內）

`processMediaForWork(workId, code, sourceUrl)`：

1. `downloadPublicFile(sourceUrl, code)`：
   - Google Drive host → `https://docs.google.com/uc?export=download&id=...`，若回 HTML 表示 quota 確認頁，從 cookie/HTML 抓 confirm token 重打。
   - 其他 URL：直接 `fetch(..., { redirect: "follow" })`。
   - 用 `MAX_MEDIA_FILE_MB`（預設 200）把關 content-length / 真實 byte。
   - 副檔名優先序：response `Content-Disposition` → final URL → source URL → MIME → `.bin`。
2. ExifTool 讀 raw exif（失敗 log warn，不中止）。
3. `isHeicAsset()` 為真 → `heic-convert` 轉成 JPEG，原 HEIC 檔砍掉，後續一切走 JPEG。
4. Upsert `Asset(kind="original")`。
5. 寫 sidecar JSON 到 `originals/<code>.json`：含 `{ private, concept, info }`，info 是抽出來的相機 / 鏡頭 / 光圈 / 快門 / ISO / megapixel / 焦距。
6. sharp 產 preview（≤2160px, q85 mozjpeg）與 thumbnail（≤900px, q78），寫到對應子目錄並 upsert `Asset`。

**不要在這流程中存 EXIF 完整 dump**——sidecar 有意只記公開欄位（concept + info），私人欄位（學號、email...）只存 `private`，但 `/api/works/:id/metadata` 也只回 `concept` 與 `info`。

`/api/admin/metadata/regenerate`：`regenerateSidecarMetadata()` 重跑步驟 2、5（不下載、不重切 derivative），給 schema 改了 sidecar 欄位時補資料用。

---

## 13. Maintenance（Admin 維運 API）

| Endpoint | 行為 |
| --- | --- |
| `POST /api/admin/maintenance/export-scores` 或 `GET /api/admin/export/scores.csv` | 直接下載 `scores-<ts>-manual.csv`，同時備份到 `/data/output/`。 |
| `POST /api/admin/maintenance/clear-scores` | **先**呼叫 `exportScoresCsv("clear-scores")` 備份+下載 CSV，**成功後**才 transaction 刪除 outbox + scores 並清 `Work.initialPassed/secondaryTotal`。 |
| `POST /api/admin/maintenance/clear-media` | 先備份 CSV 下載，再刪 Asset rows + 清空 `originals/previews/thumbnails/metadata` 子目錄。 |

Response header 會帶 `X-Photo-Grade-Backup-Path`，UI 可以給 operator 看備份檔位置。

清除動作在 server 端是 **atomic-ish**：CSV 備份要先成功（檔案 flush 到 `/data/output`）才會走刪除。**新增類似的破壞性 admin API 請維持「先備份再刪除」這個順序**。

---

## 14. 環境變數總表

完整含義與預設值維護在三處：`.env.example`、`docker-compose.yml::x-app-env`、`README.md` 的環境變數表。修改任一處請同步另外兩處。

關鍵欄位簡述（細節以程式碼 `apps/server/src/env.ts` 為準）：

| 變數 | 預設 | 重點 |
| --- | --- | --- |
| `PORT` | 8080 | 容器內 listen port，同時是 host bind port（compose 用 `${PORT}:${PORT}`）。 |
| `APP_BASE_URL` | `http://localhost:8080` | OIDC callback、Host QR 入口的對外 base。 |
| `PUBLIC_ENTRY_URL` | 同 `APP_BASE_URL` | Host QR 顯示的 `/view` 入口；可獨立於 `APP_BASE_URL`。 |
| `DATABASE_URL` | `postgresql://photo_grade:photo_grade@postgres:5432/photo_grade?schema=public` | 預設指向 compose 內 postgres；與 `POSTGRES_PASSWORD` 必須一致。 |
| `REDIS_URL` | `redis://redis:6379` | BullMQ 與 OIDC session 共用。 |
| `DATA_DIR` | `/data` | 容器內非 DB 可變資料根目錄。 |
| `AUTH_MODE` | `basic` | `basic` 或 `oidc`。後者要 `SESSION_SECRET` + `OIDC_*`。 |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | `admin` / `change-me` | basic 模式單一帳密。**部署前必改**。 |
| `SESSION_SECRET` | 空 | OIDC 模式必填，建議 ≥ 32 char random。 |
| `COOKIE_SECURE` | `auto` | `auto` 在 production 自動 secure。反向代理要把 `X-Forwarded-Proto` 帶進來。 |
| `OIDC_ISSUER_URL` / `_CLIENT_ID` / `_CLIENT_SECRET` | 空 | OIDC 模式必填；issuer 走 `/.well-known/openid-configuration` discovery。 |
| `OIDC_REDIRECT_URI` | 空（自動 `${APP_BASE_URL}/auth/callback`） | 必須與 OP 註冊的 callback 一字不差。 |
| `OIDC_SCOPES` | `openid profile email` | |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | 空 | OP 支援 `end_session_endpoint` 時 logout 會帶。 |
| `GOOGLE_SHEETS_ENABLED` | `false` | true 才會啟用 sheet sync worker；admin UI 的 sheet 設定也只在這時顯示完整版。 |
| `GOOGLE_SHEET_ID` | 空 | env-side fallback；DB 的 `SheetSyncConfig` 設定後優先生效。 |
| `GOOGLE_SHEET_WORKSHEET` | `Photo Grade Scores` | worksheet title。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` / `_FILE` | 空 / `/data/secrets/google-service-account.json` | 二擇一，JSON 字串 vs 掛載檔。 |
| `MAX_IMPORT_FILE_MB` | 50 | CSV/XLSX 上傳上限。 |
| `MAX_MEDIA_FILE_MB` | 200 | 單張作品下載上限。 |
| `IMPORT_ITEM_CONCURRENCY` | 1 | 單批 import 內並行下載/轉檔的 lane 數。建議 2–3 起測，過高觸發來源限流。 |
| `SOCKET_CORS_ORIGIN` | 空（same-origin） | 跨網域時填前端 origin。 |
| `APP_IMAGE` / `WORKER_IMAGE` | `ghcr.io/ntut-cppc/photo-grade:latest` | Synology / 純 image 部署用。 |

---

## 15. Build / Test / Deploy

### 15.1 Local

```bash
npm install
npm run prisma:generate
npm run db:push          # 對著 DATABASE_URL 推 schema
npm run build            # shared → server → web → worker
npm run dev              # 只起 server；前端要另開 npm run dev:web
npm test                 # vitest run（tests/ 目錄）
```

### 15.2 Docker

```bash
docker compose up --build -d           # 第一次 / 改完程式
docker compose up --build -d app worker  # 只重啟 app/worker（保留 DB/Redis）
docker compose down                      # 停（保留 volume）
docker compose down -v                   # 連 postgres-data / redis-data 一起砍 ⚠
docker compose ps
docker compose logs --tail=200 app worker
curl http://localhost:8080/api/health    # 應回 { ok: true, version: "<sha or unknown>" }
```

`docker compose config` 拿來檢查 `.env` / interpolation，是 PR-time check 的一部分。

### 15.3 GHCR image

`.github/workflows/publish-image.yml` 在 push `main`、tag `v*`、或手動觸發時 build 並推 `ghcr.io/<owner>/photo-grade`。`PHOTO_GRADE_VERSION=${commit_sha}` 會 bake 進 image，server 啟動 log 與 `/api/health` 都會印出來——拿來確認 Synology 是否真的拉到新 image。

Synology / 純 image 部署：在 Synology Container Manager 設定 `APP_IMAGE` / `WORKER_IMAGE` 指到 `ghcr.io/ntut-cppc/photo-grade:<tag>`，不需要本地 build context。

### 15.4 Post-change check

每完成一個段落，至少跑：

1. `npm run build`
2. `npm test`
3. `docker compose config`（如果改了 compose / env）
4. 有 Docker 環境：`docker compose up --build -d app worker` + `docker compose logs --tail=200 app worker` 看沒有 crash loop。
5. HTTP smoke：`/view` 200、`/host`/`/score`/`/admin` 401（未登入）/200（登入後）、`/api/health` 200。

UI 改動：一定要 build + 在瀏覽器跑過。前端不會被 type check 全保住——多開幾個 viewport（特別是 Host 切作品這種牽涉 Socket.IO 的流程）。

---

## 16. 常見踩雷地圖

- **OIDC `/auth/login` 直接回 `{"error":"ERR syntax error"}`**：通常代表 app 沒 redirect 到 OP，根因是 session Redis 寫入失敗。優先檢查 `connect-redis` adapter（`session.ts::createConnectRedisClient`）是否被改壞，**不要先改 OP redirect URL 或加 provider-specific authorization params**。
- **匯入卡 `QUEUED`**：先打 `/api/admin/queue/status`。`workers[]` 為空就起 worker；`active+wait` 都 0 但 DB 是 QUEUED 代表 enqueue 沒生效（過去的 colon-jobId bug）。
- **Sheet sync 「明明 service account 給了 editor 還是失敗」**：99% 是 service account email 給錯試算表，或 `GOOGLE_SHEETS_ENABLED` 沒設 true（admin UI 會把區塊收起來）。Server log `[error] cause name=GoogleAuthError ...` 會有更具體訊息。
- **HEIC 上傳會被原地轉成 JPEG**：原 `.heic` 不留——這是有意設計（避免 originals 同時存兩份 + sharp 對 HEIC 支援差）。如果 client 想保留 HEIC，要改設計而不是繞過 conversion。
- **Confirm 一按就清空現有作品**：這是設計，不是 bug。新增 import 入口請保留 `cancelActiveImports()` + `wipeAllImportData()` 步驟。
- **`processedCount` 在 retry 後從 0 開始**：`processImportBatch` 開頭重設，BullMQ retry 整個 job 時會看到。正確行為。
- **Final / Secondary 切換後看不到作品**：通常是 `PresentationState.finalCutoff` 或 `secondaryThreshold` override 仍在；admin 改 `RuleConfig` 後會清掉 presentation override（`index.ts` 的 `setRuleConfig` 處理）。要全清呼叫 `setPresentationState({ finalCutoff: <default>, secondaryThreshold: null })`。

---

## 17. Development rules（給未來 agent 的硬性約束）

- **不**新建第二個 backend package 或第二份 schema；後端就是 `apps/server`。
- **不**把 runtime 檔寫到 `DATA_DIR` 之外。新增寫檔功能必經 `assertInsideDataDir()`。
- **不**讓 Google Sheet sync 失敗影響現場評分。同步是 outbox + retry，不是同步寫 path。
- **不**在 `apps/server/src/queue.ts` 加帶冒號的 jobId。新 producer 沿用 `queue.add` 的 default options。
- **不**在 `/api/admin/imports/...` 加路由時破壞 `:id` catch-all 順序（固定字串 route 在 `:id` 之前）。
- **不**commit `.env`、`data/`、`node_modules`、build 輸出。
- **不**用 `--no-verify` / `--no-gpg-sign` 跳 hook，除非 user 明確要求。
- **不**直接 `docker compose down -v`，除非確認不需要保留 DB volume。
- 跨 client 共用契約（types、scoring rules、header alias、URL parser）放 `packages/shared`。
- 動到評分欄位、初評門檻、final cutoff 的邏輯時，寫對應的 vitest（`tests/` 目錄已有 scoring/auth/session-redis 等樣板）。
- Docker 不可用時，至少跑 `npm run build`、`npm test`、`docker compose config`；可用時加 `docker compose up --build -d` + log 檢查。
