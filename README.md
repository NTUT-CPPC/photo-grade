# Photo Grade

Docker-first 攝影評分系統。它取代舊 Flask 臨時評分器，提供後台匯入、作品下載/轉檔、主持同步、計分、評審瀏覽與 Google Sheet 同步。

專案網址：[https://github.com/NTUT-CPPC/photo-grade](https://github.com/NTUT-CPPC/photo-grade)

**`docker-compose.yml` 是預期的主要部署入口**——所有 runtime 環境變數都在裡面宣告且帶有預設值與註解，從原始碼簽出後 `cp .env.example .env && docker compose up --build -d` 應該就能跑起來。

## Docker Compose 部署

### 1. 前置需求

- Docker Engine 24+ 與 Docker Compose v2（`docker compose ...`，不是舊的 `docker-compose`）。
- 對外要 80/443 時通常會在前面架反向代理（nginx、Caddy、Traefik 等）做 TLS termination；內部仍可走預設的 8080。

### 2. 取得程式碼與 `.env`

```powershell
git clone https://github.com/NTUT-CPPC/photo-grade.git
cd photo-grade
Copy-Item .env.example .env
```

`.env` 內所有變數都會被 `docker-compose.yml` 讀取。需要覆寫的至少是登入帳密：

```env
AUTH_MODE=basic
AUTH_USERNAME=admin
AUTH_PASSWORD=請改成強密碼

# 對外網址；放在反向代理後請填正式網域，會反映在 Host 頁面 QR code。
APP_BASE_URL=https://judge.example.com
PUBLIC_ENTRY_URL=https://judge.example.com
```

如果要改用 OIDC 登入，請看 [登入模式 (Auth)](#登入模式-auth)。

### 3. 啟動

```powershell
docker compose up --build -d
docker compose ps
docker compose logs --tail=200 app worker
```

- `app`：Express + Socket.IO server，啟動時會跑 `prisma db push` 自動同步 schema。
- `worker`：BullMQ worker，跑匯入下載/轉檔與 Google Sheet 同步。
- `postgres`：PostgreSQL 17，資料放在 named volume `postgres-data`。
- `redis`：Redis 7，給 BullMQ 與 OIDC session 共用。

服務正常後可開：

- Admin: http://localhost:8080/admin
- Host:  http://localhost:8080/host
- Score: http://localhost:8080/score
- View:  http://localhost:8080/view

`/host`、`/score`、`/admin` 需要登入；`/view` 公開。任何登入成功的帳號都能使用三個受保護介面，沒有角色分流。

### 4. 套用變更與重啟

只改 app/worker 程式碼（保留 DB/Redis）：

```powershell
docker compose up --build -d app worker
```

完整重啟全部容器：

```powershell
docker compose down
docker compose up --build -d
```

清除 DB（**會刪除所有評分與作品紀錄**）：

```powershell
docker compose down -v
```

### 5. 環境變數一覽

`docker-compose.yml` 內的 `x-app-env` 區塊已宣告下列所有變數，且提供合理預設值；`.env` 只需要寫想覆寫的項目。

| 變數 | 預設 | 必要 | 說明 |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | 否 | 影響 cookie secure 判斷與 logging。 |
| `PORT` | `8080` | 否 | 容器內 server listen port，同時也是 compose 對外暴露的 host port。 |
| `APP_BASE_URL` | `http://localhost:8080` | 否 | 對外網址；OIDC callback 與 Host QR 入口會用到。 |
| `PUBLIC_ENTRY_URL` | 同 `APP_BASE_URL` | 否 | Host 頁面顯示的 View 入口 QR code 網址。 |
| `DATA_DIR` | `/data` | 否 | 容器內非 DB 可變資料根目錄。對應 host 的 `./data`。 |
| `POSTGRES_PASSWORD` | `photo_grade` | **建議覆寫** | 同時用於 `postgres` service 與 `DATABASE_URL`。 |
| `DATABASE_URL` | 自動組裝 | 否 | 預設指向 compose 內的 postgres；外接 DB 時可整段覆寫。 |
| `REDIS_URL` | `redis://redis:6379` | 否 | 預設指向 compose 內的 redis。 |
| `AUTH_MODE` | `basic` | 否 | `basic` 或 `oidc`。 |
| `AUTH_USERNAME` | `admin` | basic 模式必改 | Basic Auth 帳號。 |
| `AUTH_PASSWORD` | `change-me` | basic 模式必改 | Basic Auth 密碼。 |
| `SESSION_SECRET` | _(空)_ | OIDC 必填 | 用來簽 session cookie，至少 32 字元隨機字串。 |
| `COOKIE_SECURE` | `auto` | 否 | `auto` / `true` / `false`。 |
| `OIDC_ISSUER_URL` | _(空)_ | OIDC 必填 | OP 的 issuer URL，會走 `/.well-known/openid-configuration` discovery。 |
| `OIDC_CLIENT_ID` | _(空)_ | OIDC 必填 | OP 端註冊的 client id。 |
| `OIDC_CLIENT_SECRET` | _(空)_ | OIDC 必填 | OP 端對應的 secret。 |
| `OIDC_REDIRECT_URI` | _(空，自動)_ | 否 | 留空時自動使用 `${APP_BASE_URL}/auth/callback`，**必須與 OP 端註冊一字不差**。 |
| `OIDC_SCOPES` | `openid profile email` | 否 | 自訂 OIDC scope。 |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | _(空)_ | 否 | 設定後 logout 會 redirect。 |
| `GOOGLE_SHEETS_ENABLED` | `false` | 否 | `true` 才會啟用 Sheet 同步 worker。 |
| `GOOGLE_SHEET_ID` | _(空)_ | 啟用 Sheet 必填 | 試算表 ID（網址中 `/d/{ID}/` 那段）。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | _(空)_ | 二擇一 | 直接放 service account JSON 字串。 |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | `/data/secrets/google-service-account.json` | 二擇一 | 指向掛載到容器內的 key 檔案。 |
| `MAX_IMPORT_FILE_MB` | `50` | 否 | 匯入 CSV/XLSX 上限。 |
| `MAX_MEDIA_FILE_MB` | `200` | 否 | 單一作品下載上限。 |
| `SOCKET_CORS_ORIGIN` | _(空)_ | 跨網域時 | 留空 = same-origin；跨網域請填前端 origin（含 scheme）。 |

### 6. 反向代理建議

App 啟動時 `trust proxy = 1`，OIDC callback 與 cookie secure 判斷會依賴 `X-Forwarded-Proto` / `Host`。請務必在前面放一層自己控制的 proxy（nginx / Caddy / Traefik），並且：

- 終止 TLS 後將 `X-Forwarded-Proto: https`、`X-Forwarded-Host` 帶到後端。
- WebSocket 升級必須通（`/socket.io/` 路徑）。
- 若要直接暴露容器到公網而沒有 proxy，請把 `apps/server/src/index.ts` 中的 `trust proxy` 改回 `false`，避免 client 偽造 header 影響 OIDC callback URL。

## 登入模式 (Auth)

`AUTH_MODE` 控制登入機制：

- `AUTH_MODE=basic`（預設）：HTTP Basic Auth，現場手動輸入單一帳號密碼。瀏覽器會跳出原生登入彈窗。
- `AUTH_MODE=oidc`：走 OpenID Connect Authorization Code (PKCE) flow，由公司 / 第三方 OIDC OP 認證。Session 用 Redis (`REDIS_URL`) 存放。

無論哪種模式，**`/view` 都不需要登入**；登入成功後三個受保護介面（host / score / admin）都能進，沒有額外角色檢查。

### Basic 模式

```env
AUTH_MODE=basic
AUTH_USERNAME=admin
AUTH_PASSWORD=change-me
```

### OIDC 模式

需要在 OP 端先註冊一個 client（confidential / web 類型）並把 callback URL 設成 `${APP_BASE_URL}/auth/callback`，例如本機 `http://localhost:8080/auth/callback`。Keycloak、Auth0、Google、Microsoft Entra (Azure AD) 等任何標準 OIDC OP 皆可。

```env
AUTH_MODE=oidc

# Session
SESSION_SECRET=請填一段足夠長的隨機字串
COOKIE_SECURE=auto      # auto: 在 NODE_ENV=production 時為 true；可改 true/false 強制覆蓋

# OIDC client
OIDC_ISSUER_URL=https://your-op.example.com/realms/photo-grade
OIDC_CLIENT_ID=photo-grade
OIDC_CLIENT_SECRET=請填 OP 給的 secret
OIDC_REDIRECT_URI=                   # 留空時自動使用 ${APP_BASE_URL}/auth/callback
OIDC_SCOPES=openid profile email
OIDC_POST_LOGOUT_REDIRECT_URI=       # 選填；OP 支援 end_session_endpoint 時會帶
```

| 變數 | 必要 | 說明 |
| --- | --- | --- |
| `AUTH_MODE` | 是 | `basic` 或 `oidc`。 |
| `SESSION_SECRET` | OIDC 模式必填 | 用來簽 session cookie。 |
| `COOKIE_SECURE` | 否 | `auto` / `true` / `false`。反向代理走 HTTPS 時通常 `auto` 即可（會在 production 自動 secure）。 |
| `OIDC_ISSUER_URL` | OIDC 模式必填 | OP 的 issuer，會用 `/.well-known/openid-configuration` 自動 discovery。 |
| `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | OIDC 模式必填 | 在 OP 端註冊的 client 憑證。 |
| `OIDC_REDIRECT_URI` | 否 | 預設 `${APP_BASE_URL}/auth/callback`；若部署網域與 `APP_BASE_URL` 不同請手動填。**必須與 OP 端註冊的 callback URL 一字不差（含 scheme、host、port、path）**，這是首次部署最常見的失敗原因。 |
| `OIDC_SCOPES` | 否 | 預設 `openid profile email`。 |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | 否 | 設定後 logout 會把使用者導回此網址（前提是 OP 支援 `end_session_endpoint`）。 |

#### 行為摘要

- 未登入造訪 `/host`、`/score`、`/admin` 會被導向 `/auth/login?returnTo=...`，登入成功後再回到原本頁面。
- 受保護的 API（例：`POST /api/scores`）未登入時回 `401`，前端會處理。
- `POST /auth/logout` 會銷毀本地 session；若 OP 提供 `end_session_endpoint`，會 redirect 過去做 OP-side signout，否則直接回 `/view`。
- Socket.IO 在 OIDC 模式下共用同一個 session cookie；handshake 時 cookie 對應的 session 必須有 `user`，否則 `host:setState`、`score:submit` 等事件會被拒絕。
- App 啟動時 `trust proxy = 1`，OIDC callback URL 從 `X-Forwarded-Proto` / `Host` 推算。若部署沒有放在反向代理之後，請在前面加一層 proxy 或在 `apps/server/src/index.ts` 把 `trust proxy` 改回 `false`，以免 client 偽造這兩個 header 影響 callback URL。

## data 目錄

Docker 會把專案根目錄的 `./data` 掛進容器 `/data`。所有非 DB 可變檔案都放在這裡：

```text
data/imports      上傳的 CSV/XLSX
data/originals    原始作品檔，永遠保留
data/previews     Web 顯示圖
data/thumbnails   縮圖
data/metadata     ExifTool metadata JSON
data/logs         可選 log
data/exports      匯出結果
data/secrets      可選 service account JSON，不要 commit
```

PostgreSQL 資料不放在 `./data`，而是 Docker volume `postgres-data`。備份時請同時備份 `./data` 與 PostgreSQL dump。

清除非 DB 檔案：

```powershell
Remove-Item -Recurse -Force .\data
```

清除 DB volume：

```powershell
docker compose down -v
```

## 匯入格式

Admin 支援 `.csv` 與 `.xlsx`。Excel 只讀第一個 worksheet。

必要欄位可使用底線或空白版本：

```text
編號
電子郵件地址
學校
系級
學號
作者 或 別稱
作品1_名稱 或 作品1 名稱
作品1_檔案 或 作品1 檔案
作品1_創作理念 或 作品1 創作理念
作品2_名稱 或 作品2 名稱
作品2_檔案 或 作品2 檔案
作品2_創作理念 或 作品2 創作理念
```

`編號` 可留空，留空時會依資料列順序自動使用 `1`、`2`、`3`...。每位投稿者的作品都會在編號後加作品序號：作品 1 為 `a`、作品 2 為 `b`。例如 `編號=123` 且投兩張，會匯入為 `123a`、`123b`；即使只投一張，也會匯入為 `123a`。

作品 2 可以空白。匯入時系統會先 dry-run，確認沒有缺欄或資料問題後再下載與轉檔。

目前只支援公開 Google Drive 連結與一般公開 URL。Google Drive 連結可為：

```text
https://drive.google.com/open?id=FILE_ID
https://drive.google.com/file/d/FILE_ID/view
```

## Google Sheet 同步

PostgreSQL 是主資料來源。送分會先寫入 DB，再由 worker 非同步同步到 Google Sheet；同步失敗不會阻塞現場評分。

設定步驟：

1. 到 Google Cloud Console 建立 project。
2. 啟用 Google Sheets API。
3. 建立 Service Account。
4. 下載 JSON key。
5. 將 JSON 放到 `data/secrets/google-service-account.json`。
6. 把目標試算表分享給 service account email，權限至少是 Editor。
7. 在 `.env` 設定：

   ```env
   GOOGLE_SHEETS_ENABLED=true
   GOOGLE_SHEET_ID=你的試算表 ID
   GOOGLE_SERVICE_ACCOUNT_FILE=/data/secrets/google-service-account.json
   ```

同步時若 Sheet 沒有 `作品編號` 或評分欄位，系統會自動補欄位。

## 本機開發

```powershell
npm install
npm run prisma:generate
npm run db:push
npm run build
npm run dev
```

開發時需要本機 PostgreSQL/Redis，或直接用 Docker Compose。

## 驗證

```powershell
npm test
npm run build
docker compose up --build
```

瀏覽器檢查重點：

- `/view` 可直接開。
- Basic 模式下 `/host`、`/score`、`/admin` 未登入會跳瀏覽器帳密彈窗；OIDC 模式下會 redirect 到 OP 登入頁，登入完成自動回原頁。
- Admin 匯入 sample CSV 後，`data/originals`、`data/previews`、`data/thumbnails`、`data/metadata` 會產生檔案。
- Host 切換作品後 Score/View 同步。
- Score 送出後 Host 顯示即時送分提示。

## Admin 內建工具

- 評審設定：可在 Admin 頁面新增、刪除、拖曳排序評審名字，按 `儲存` 後寫回。Score 頁面會依完整評審名單產生欄位，不限 3 位。
- 匯入範本下載：Admin 頁面可直接下載 CSV 與 Excel 範本，再填入投稿資料後做 dry-run/confirm。
- 按鈕提示：`Dry run` 和 `Confirm` 按鈕有 tooltip 說明操作差異。
