# AGENTS.md

## Project Purpose

Photo Grade 是可重用的攝影評分系統。它從 Google 表單匯出的 CSV/XLSX 建立作品資料，下載公開作品連結，保留原始檔與 metadata，並提供現場主持、計分、評審瀏覽與管理後台。

## Architecture

- `apps/server`：Express API、Socket.IO、Basic Auth、Prisma、media serving。
- `apps/web`：React/Vite UI，包含 `/admin`、`/host`、`/score`、`/view`。
- `apps/worker`：BullMQ worker，處理匯入、下載/轉檔、metadata、Google Sheet sync。
- `packages/shared`：跨前後端共用的 types、評分規則、CSV header aliases、Google Drive URL parser。

PostgreSQL 是主資料來源。Redis/BullMQ 負責背景工作。Google Sheet 是同步目標，不是評分真實來源。

## Runtime Data Rule

所有非 DB 可變資料必須寫在 `DATA_DIR`，Docker 預設是 `/data`，compose 掛載為 `./data:/data`。

允許子目錄：

- `imports`
- `originals`
- `previews`
- `thumbnails`
- `metadata`
- `logs`
- `exports`
- `secrets`

不要把上傳、下載、轉檔、metadata、匯出檔寫到 repo 其他位置。

## Core Flow

1. Admin 上傳 CSV/XLSX。
2. Server 儲存到 `/data/imports` 並 dry-run。
3. Admin 確認後建立 BullMQ import job。
4. Worker 建立/更新 Work，下載公開 Drive/URL 檔到 `/data/originals`。
5. Worker 用 ExifTool 寫 metadata JSON 到 `/data/metadata`。
6. Worker 用 sharp 寫 preview/thumbnail。
7. Host 控制目前 mode/work，Socket.IO 廣播 `state:changed`。
8. Score 送出分數，DB 先寫入，Socket.IO 廣播 `score:changed`。
9. Worker 非同步同步分數到 Google Sheet。

## Scoring Rules

- 初評：`初評`，0-3。
- 複評：`複評一`、`複評二`、`複評三`，3-5。
- 決評：`決評美感一/二/三`、`決評故事一/二/三`、`決評創意一/二/三`，3-5。
- 複評清單：`initialPassed`。
- 決評清單：`secondaryTotal` 前 30 名含同分。

## Auth

初版只用 HTTP Basic Auth：

- `/host`：host 或 admin。
- `/score`：score 或 admin。
- `/admin`：admin。
- `/view`：公開。

後續若換完整登入系統，保留 role-based API 邊界。

## Development Notes

- 手動新增 runtime 檔案前先檢查是否落在 `DATA_DIR`。
- 修改 shared scoring/header 規則時，同步補測試。
- Google Sheet 同步不得阻塞現場評分。
- Frontend UI 應維持照片優先、暗色、左右分欄，不使用大量 emoji。
