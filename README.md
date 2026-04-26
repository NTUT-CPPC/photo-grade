# Photo Grade

Docker-first 攝影評分系統。它取代舊 Flask 臨時評分器，提供後台匯入、作品下載/轉檔、主持同步、計分、評審瀏覽與 Google Sheet 同步。

## 快速啟動

1. 複製環境設定：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 編輯 `.env`，至少設定一組登入帳密（給 host/score/admin 共用，登入成功就能進三個介面）：

   ```env
   AUTH_MODE=basic
   AUTH_USERNAME=admin
   AUTH_PASSWORD=change-me
   ```

   若要改用 OIDC，請看下方 [登入模式 (Auth)](#登入模式-auth)。

   若對外提供固定入口網址（例如反向代理或公網網域），請一併設定：

   ```env
   PUBLIC_ENTRY_URL=https://your-domain.example.com
   ```

3. 啟動：

   ```powershell
   docker compose up --build
   ```

4. 開啟：

   - Admin: http://localhost:8080/admin
- Host: http://localhost:8080/host
- Score: http://localhost:8080/score
- View: http://localhost:8080/view

`PUBLIC_ENTRY_URL` 會用於 Host 頁面 top nav 內的 View QR code 與入口連結。

`/host`、`/score`、`/admin` 需要登入；`/view` 不需要登入。任何成功登入都可以使用三個受保護的介面，沒有角色限制。

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
