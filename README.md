# Photo Grade

Photo Grade 是一套用於「攝影徵件比賽」的線上評分系統。它涵蓋：作品從 Google 表單匯入、自動下載並轉檔、評審現場計分、主持機切換時自動同步觀看畫面、以及把評分結果非同步同步回 Google 試算表。

> **這份 README 是給活動主辦人、操作人員看的**——即使你不是工程背景，也應該能照著一步一步把系統架起來。
>
> 想看「給開發者/AI 代理人的」實作細節，請改看 `AGENTS.md`。

專案網址：<https://github.com/NTUT-CPPC/photo-grade>

---

## 目錄

1. [系統能做什麼](#1-系統能做什麼)
2. [部署前的準備](#2-部署前的準備)
3. [快速啟動（Docker Compose）](#3-快速啟動docker-compose)
4. [申請 Google Sheets API Service Account](#4-申請-google-sheets-api-service-account)
5. [開啟登入並設定密碼](#5-開啟登入並設定密碼)
6. [使用 OIDC 單一登入（進階，可略）](#6-使用-oidc-單一登入進階可略)
7. [日常操作](#7-日常操作)
8. [作品匯入格式](#8-作品匯入格式)
9. [`./data` 資料夾](#9-data-資料夾)
10. [環境變數總表](#10-環境變數總表)
11. [本機開發](#11-本機開發)
12. [疑難排解](#12-疑難排解)

---

## 1. 系統能做什麼

簡單地說，一場比賽會經過下面的流程，Photo Grade 對應到每個流程都有畫面：

| 階段 | 對應網頁 | 誰會看到 |
| --- | --- | --- |
| 主辦設定評審名單、匯入作品、調整規則 | `/admin` | 主辦端 |
| 主持人切換目前作品、切換評審階段（初評 / 複評 / 決評） | `/host` | 主持機 |
| 評審用平板/筆電打分 | `/score` | 評審 |
| 觀眾大螢幕、會場投影 | `/view` | 公開（不需登入） |

`/host`、`/score`、`/admin` 都需要登入，但任一帳號都能進；`/view` 是完全公開的。系統不分「主持/評審/管理員」帳號 — 通常一台機器只開一個 tab，由人來分。

主要功能：

- **匯入**：從 Google 表單匯出的 CSV 或 Excel 直接上傳。系統會先「試跑」檢查欄位，再確認送出。
- **自動下載作品**：支援公開 Google Drive 連結與一般公開 URL。HEIC 會自動轉成 JPEG。
- **評審名單可拖曳排序**：超過 3 位評審也支援，自動產生 `複評4` `決評美感4` 這類欄位。
- **主持切換 → 全場同步**：主持機切作品或階段，評審頁與大螢幕頁立刻跟上。
- **Google 試算表同步（選用）**：每次送分後，系統會在背景把分數同步到指定試算表。同步失敗不會卡住現場評分，可以隨時重試。
- **強制備份的清除**：清除分數或圖片前，系統一定先匯出一份 CSV 到 `./data/output/` 並讓你下載，才會真的清。

---

## 2. 部署前的準備

請準備好以下東西，整個過程約需 30–60 分鐘（含申請 Google API）：

### 2.1 一台可以裝 Docker 的伺服器

- Docker Engine 24 以上 + Docker Compose v2（指令是 `docker compose ...`，不是舊的 `docker-compose`）。
- Windows 用 [Docker Desktop](https://www.docker.com/products/docker-desktop/) 即可，已內建 compose v2。
- 對外埠號預設是 `8080`。如果要對公網用 80/443，建議在系統前面架一層反向代理（Nginx / Caddy / Traefik 等）做 TLS。
- 預留 5 GB 以上磁碟空間（作品原始檔通常是大頭）。

### 2.2 一個 Google 帳號（要做 Google Sheets 同步才需要）

如果不想做 Google 試算表同步，可以先跳過第 4 章；現場評分仍可正常運作，分數會留在 PostgreSQL，需要時用 admin 後台匯出 CSV。

### 2.3 拿到專案程式碼

```bash
git clone https://github.com/NTUT-CPPC/photo-grade.git
cd photo-grade
```

> 如果是 Windows / PowerShell，請把後續所有 `cp` 換成 `Copy-Item`，反斜線 `\` 換成 `/`。指令本身相容。

---

## 3. 快速啟動（Docker Compose）

### 步驟 1：建立 `.env`

```bash
cp .env.example .env
```

打開 `.env`，**至少把這兩行改成你自己的密碼**（其他先不用動）：

```env
AUTH_USERNAME=admin
AUTH_PASSWORD=請改成一段你記得住的強密碼
```

如果之後會放在公網（非 localhost），請也把這兩行改成正式網址，否則 Host 頁的 QR code 會指向 `localhost`：

```env
APP_BASE_URL=https://你的網域
PUBLIC_ENTRY_URL=https://你的網域
```

### 步驟 2：啟動

```bash
docker compose up --build -d
```

第一次會比較久（要下載 Node.js base image 並安裝相依套件），完成後檢查：

```bash
docker compose ps
```

四個 service 都要是 `running`：

- `app`：網頁 + API。
- `worker`：背景任務（下載作品、同步試算表）。
- `postgres`：資料庫。
- `redis`：背景任務佇列 + 登入 session。

### 步驟 3：打開瀏覽器

| 用途 | 網址（換成你自己的網域/IP） |
| --- | --- |
| 公開觀看頁 | <http://localhost:8080/view> |
| 主辦後台 | <http://localhost:8080/admin> |
| 主持機 | <http://localhost:8080/host> |
| 評審計分 | <http://localhost:8080/score> |

第一次進 `/admin`、`/host`、`/score` 會跳出帳密登入框。輸入你在 `.env` 設的 `AUTH_USERNAME` / `AUTH_PASSWORD`。

### 步驟 4：之後要套用程式碼變更

只動到 app/worker、不需要重建 DB：

```bash
docker compose up --build -d app worker
```

整組重來（**保留資料庫**）：

```bash
docker compose down
docker compose up --build -d
```

整組重來（**會刪掉所有作品與評分！**）：

```bash
docker compose down -v
```

---

## 4. 申請 Google Sheets API Service Account

> 如果這場比賽不需要把分數同步到 Google 試算表，可以跳過整個第 4 章。系統其他功能都不依賴它。

Google 試算表同步走 **Service Account**——這是一種「機器帳號」，比 OAuth 簡單，因為不需要任何人去點同意按鈕；只需要把試算表「分享」給這個機器帳號的 email 即可。

整個申請流程約 10 分鐘，全部在瀏覽器完成。

### 4.1 建立 Google Cloud 專案

1. 用一個 Google 帳號登入 <https://console.cloud.google.com/>。第一次進去會要你同意服務條款。
2. 點畫面上方靠左、寫著 「Select a project」（或「選取專案」）的下拉選單 → 「**NEW PROJECT / 新增專案**」。
3. 取個名字（例如 `photo-grade-2026`），按 「**CREATE / 建立**」。
4. 等幾秒，畫面右上角的鈴鐺通知會顯示專案建立完成；下拉選單切換到剛建好的專案。

### 4.2 啟用 Google Sheets API

1. 左側漢堡選單 → 「**APIs & Services / API 和服務**」 → 「**Library / 程式庫**」。
2. 搜尋 `Google Sheets API`，點進去 → 按「**ENABLE / 啟用**」。
3. 等個幾秒，回到 API & Services 主頁應該能看到 Sheets API 已啟用。

> 你**不需要**啟用 Google Drive API。系統用的是公開 Drive 連結（不走 API），不會用到 Drive 的 OAuth。

### 4.3 建立 Service Account

1. 左側選單 → 「**APIs & Services / API 和服務**」 → 「**Credentials / 憑證**」。
2. 點上方 「**+ CREATE CREDENTIALS / 建立憑證**」 → 「**Service account / 服務帳戶**」。
3. 填寫：
   - **Service account name**（服務帳戶名稱）：例如 `photo-grade-sheets`。
   - **Service account ID**：會自動填，記下來，會長得像 `photo-grade-sheets`，最終的 email 是 `photo-grade-sheets@<你的專案 id>.iam.gserviceaccount.com`。
   - **Description**（說明）：可填可不填。
4. 點 「**CREATE AND CONTINUE / 建立並繼續**」。
5. 「Grant this service account access to project」這一段**直接跳過**（不需要授權任何 IAM 角色，因為我們只用它對「特定試算表」做存取）。按 「**Continue**」。
6. 「Grant users access to this service account」也**跳過**，按 「**Done / 完成**」。

### 4.4 下載 JSON 金鑰

1. 在 Credentials 列表會看到你剛剛建立的 service account，點它的名字進去。
2. 切到 「**KEYS / 金鑰**」分頁 → 「**ADD KEY / 新增金鑰**」 → 「**Create new key / 建立新的金鑰**」。
3. 選 **JSON** → 「**CREATE / 建立**」。
4. 瀏覽器會自動下載一個 `.json` 檔，**這個檔案就是密碼，請妥善保管，不要 commit 到 git**。

### 4.5 把 JSON 金鑰放到伺服器上

把剛下載的 JSON 重新命名為 `google-service-account.json`，放到 `./data/secrets/` 底下：

```
photo-grade/
└── data/
    └── secrets/
        └── google-service-account.json   ← 這裡
```

> `./data/` 資料夾會在 `docker compose up` 第一次啟動時自動建出來；你也可以手動建。

### 4.6 取得 Service Account 的 email

打開那個 JSON，找到 `"client_email"` 這一欄，值會是：

```
photo-grade-sheets@photo-grade-2026.iam.gserviceaccount.com
```

把這個 email 整段複製下來，下一步要用。

### 4.7 建立試算表並分享給 Service Account

1. 打開 <https://sheets.google.com/>，建一個新的試算表（取個名字，例如 `Photo Grade 2026 評分`）。
2. 點右上角 「**Share / 共用**」按鈕。
3. 在「Add people, groups」欄位貼上剛才複製的 service account email。
4. 權限改成 「**Editor / 編輯者**」。
5. 「**Notify people**」可以取消勾選（機器帳號收不到通知信也沒差）。
6. 按 「**Send / 傳送**」。

> ⚠️ **不要**改成「知道連結的任何人可編輯」——那會讓整個試算表變成公開可寫，安全性極差。Service Account 只需要對「**它自己**」是 editor，對其他人維持原本的權限即可。

### 4.8 拿到試算表 ID

試算表的網址長這樣：

```
https://docs.google.com/spreadsheets/d/1AbCdEfGh_XYZ.../edit#gid=0
                                       ^^^^^^^^^^^^^^^
                                       這一段就是 Spreadsheet ID
```

整個 URL 也可以直接用，系統會幫你解析；或者只貼中間那段 ID 也行。

### 4.9 在 `.env` 啟用 Sheet 同步

打開 `.env`，把 Google Sheet 相關設定改成：

```env
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEET_ID=                       # 可不填；之後可以在 admin 後台貼網址設定
GOOGLE_SHEET_WORKSHEET=Photo Grade Scores
GOOGLE_SERVICE_ACCOUNT_FILE=/data/secrets/google-service-account.json
```

> `GOOGLE_SERVICE_ACCOUNT_JSON` 與 `GOOGLE_SERVICE_ACCOUNT_FILE` 是**二擇一**。
> - 用檔案最簡單：把 JSON 放到 `./data/secrets/google-service-account.json`，預設值就指向那裡。
> - 用環境變數：把整段 JSON 內容（**含換行**）貼到 `GOOGLE_SERVICE_ACCOUNT_JSON`，記得用單引號包起來。多用於不方便掛載檔案的雲端平台。

存檔後重啟 app/worker：

```bash
docker compose up -d app worker
```

### 4.10 在後台貼上試算表網址

1. 開 `/admin`（要登入）。
2. 找到「Google Sheet 同步」區塊。
3. 應該會顯示偵測到的 service account email——對得上 `client_email` 就代表金鑰讀進去了。
4. 把試算表的整段 URL 貼到輸入框，按 **儲存**。系統會自動解析出 ID 並寫入資料庫。
5. 之後送一筆分數，幾秒內試算表應該會出現 `作品編號`、`作品連結` 與對應評分欄位。

> 系統第一次寫試算表時會自動補欄位（header）。如果你之後手動改欄位順序，下次同步時會自動建立一個 timestamp 後綴的新工作表（例如 `Photo Grade Scores-20260430-101500`），不會去覆蓋你手動編輯過的內容。

---

## 5. 開啟登入並設定密碼

預設用最簡單的 **HTTP Basic Auth**：所有受保護頁面共用單一帳密，瀏覽器會原生跳出登入框。

```env
AUTH_MODE=basic
AUTH_USERNAME=admin
AUTH_PASSWORD=請改成強密碼
```

改完後重啟：

```bash
docker compose up -d app worker
```

> 這個帳密**沒有角色分**：能登入就能用 `/host`、`/score`、`/admin`。現場分配通常是「主持機開 `/host`、評審平板開 `/score`、後台筆電開 `/admin`」。
>
> 想要單獨給評審不同帳號？目前不支援；建議用 OIDC（下一節）並利用 OP 端的群組管理。

---

## 6. 使用 OIDC 單一登入（進階，可略）

如果學校 / 組織有自己的 SSO（Keycloak、Auth0、Microsoft Entra、Google Workspace ...），可以改用 OpenID Connect 登入。一般小型活動用 Basic 就夠；OIDC 是給有合規要求或多人協作場景。

### 6.1 在 OP（你的 SSO）端註冊應用

註冊一個 **Confidential / Web** 類型的 OIDC client，callback URL 設為：

```
${APP_BASE_URL}/auth/callback
```

例如本機是 `http://localhost:8080/auth/callback`，正式機是 `https://judge.example.com/auth/callback`。**callback URL 必須完全一字不差**——`http` vs `https`、結尾有沒有斜線、port 都不能差。

OP 會給你：

- Issuer URL（會自動 discovery `/.well-known/openid-configuration`）
- Client ID
- Client Secret

### 6.2 在 `.env` 切換到 OIDC

```env
AUTH_MODE=oidc

SESSION_SECRET=請填一段足夠長的隨機字串-至少32字元
COOKIE_SECURE=auto

OIDC_ISSUER_URL=https://your-op.example.com
OIDC_CLIENT_ID=填 OP 給的 client id
OIDC_CLIENT_SECRET=填 OP 給的 secret
OIDC_REDIRECT_URI=                        # 留空會自動用 APP_BASE_URL/auth/callback
OIDC_SCOPES=openid profile email
OIDC_POST_LOGOUT_REDIRECT_URI=            # 選填
```

重啟後，未登入造訪 `/host`、`/score`、`/admin` 會自動 redirect 到 OP 登入頁，登入完跳回原本網址。

### 6.3 反向代理注意事項

App 啟動時會 `trust proxy = 1`：OIDC callback URL 與 cookie secure 判斷依賴前端 proxy 帶的 `X-Forwarded-Proto` / `X-Forwarded-Host`。所以：

- **務必**在前面放一層你自己控制的反向代理（Nginx、Caddy、Traefik 等），終止 TLS 後把 `X-Forwarded-Proto: https` 帶到後端。
- WebSocket 升級必須通（`/socket.io/` 路徑）。
- 如果**沒有**反向代理（例如直接把容器 port 暴露到公網），請手動把 `apps/server/src/index.ts` 內的 `app.set("trust proxy", 1)` 改成 `false`，否則攻擊者可以偽造這兩個 header 影響 callback URL。

---

## 7. 日常操作

### 7.1 第一次設定（場次一開始）

1. **登入 `/admin`**。
2. **設定評審**：在「評審設定」區塊新增名字（可拖曳調整順序），按 **儲存**。
3. **規則設定**：
   - 「決評取前 N 名」：預設 60。
   - 「複評初評過半門檻」：預設留空 = `ceil(評審數 / 2)`，自動依評審人數。
4. **匯入作品**：拖曳或選擇 CSV/Excel → 系統自動跑「試跑」→ 確認沒有錯誤後按 **Confirm**。
5. （選）**Google Sheet 同步**：照第 4 章貼上試算表網址。
6. **下載匯入範本**：admin 頁面右上有 CSV / Excel 範本下載按鈕，可以給填表的人作參考。

> ⚠️ 按 Confirm 會清空現有所有作品、分數與圖片！這是有意設計：等於「重新匯入這場比賽」。如果只是要修改個別作品，建議改 Google 試算表後重新匯入整批。

### 7.2 比賽當天

1. **主持機**開 `/host`，當下作品 / 階段切換由這台控制。
2. **評審平板**開 `/score`，自動跟著主持切換的作品；評審打完分按送出。
3. **大螢幕**開 `/view`（不登入），顯示當前作品。
4. 切換評審階段（初評 → 複評 → 決評）：在主持機按 Mode 切換，會跳出對話框預覽「按目前規則會抓幾張」，確認後再切。

### 7.3 比賽結束 / 場次清除

1. **匯出評分 CSV**：admin 頁「資料維護」→ **匯出評分 CSV**。檔案會同時下載並備份到 `./data/output/`。
2. **清除分數**：「清除評分資料」**會強制先匯出一份 CSV 並下載**，下載成功後才真的清。
3. **清除圖片**：「清除圖片資料」也是先匯出 CSV 再清——這是為了即使誤按也有最後一份備份。
4. 整場結束想徹底重來：`docker compose down -v` 會把 PostgreSQL 也一起砍。**確定不要保留任何分數紀錄**才用。

---

## 8. 作品匯入格式

支援 `.csv` 與 `.xlsx`。Excel 只讀第一個工作表。

### 8.1 兩種欄位風格擇一

**A. 直接欄位**（推薦給新表單）：

```
編號, 作品名稱, 作品檔案, 創作理念, 作者, 電子郵件地址, 學校, 系級, 學號
```

每一列就是一張作品。

**B. 舊 Google 表單欄位**（一筆投稿可以有兩張作品）：

```
編號, 作品1_名稱, 作品1_檔案, 作品1_創作理念, 作品2_名稱, 作品2_檔案, 作品2_創作理念,
作者, 電子郵件地址, 學校, 系級, 學號
```

每一列代表一位投稿者；作品 2 可以整段空白略過。

底線版（`作品1_名稱`）和空白版（`作品1 名稱`）都接受。系統會自動正規化欄位名。

### 8.2 編號規則

- `編號` 可以**空白**：留空時系統會用資料列順序自動編 `1`、`2`、`3`...。
- 每張作品最終代碼會加一個 `a` / `b` 後綴：作品 1 → `a`，作品 2 → `b`。
- 例：`編號=123` 投兩張會變 `123a`、`123b`；只投一張也是 `123a`（這樣從外面看不出來他有沒有投第二張）。

### 8.3 作品檔案連結

目前**只支援公開連結**：

- 公開的 Google Drive 檔案（任何「知道連結的任何人皆可檢視」就行）。可接受的格式：
  ```
  https://drive.google.com/open?id=FILE_ID
  https://drive.google.com/file/d/FILE_ID/view
  https://drive.google.com/file/d/FILE_ID/view?usp=drive_link
  ```
- 任何 https/http 公開可下載的圖片 URL。

> ⚠️ **私人 Drive、需要登入才能看的連結都不能用**。系統故意不支援 OAuth 取得別人 Drive 的權限——這需要使用者每次都點同意，違背「批次匯入」的目的。請告知投稿者把檔案分享設定改成「知道連結的任何人皆可檢視」。

支援的圖片格式：JPEG、PNG、HEIC（會自動轉成 JPEG）、TIFF、WebP、BMP。

### 8.4 試跑（Dry-run）會檢查什麼

選好檔案後系統自動跑試跑：

- 必要欄位是否齊全（標頭至少要有 `作品名稱` + `作品檔案`，或舊版的 `作品1_名稱` + `作品1_檔案`）。
- 連結格式（要是 `http://` 或 `https://`）。
- 重複的作品編號。
- 名稱缺失（會以「無標題」匯入並顯示 warning，不擋送出）。

有 error 時 Confirm 按鈕會 disable，請先修檔案再上傳；warning 不擋送出。

---

## 9. `./data` 資料夾

所有非資料庫的執行檔案（圖片、上傳的 CSV、評分匯出備份）都存在專案根目錄的 `./data/`，Docker 會掛進容器的 `/data`。

```
data/
  imports/        admin 上傳的 CSV/XLSX 原檔
  originals/      下載到的原作品（HEIC 已轉成 JPEG），永久保留
  previews/       2160px 預覽 JPEG（用於主持/評審畫面）
  thumbnails/     900px 縮圖（用於列表）
  metadata/       （保留）ExifTool sidecar；目前實作是放在 originals/ 裡
  output/         「匯出評分 CSV」與「清除前的強制備份」
  exports/        保留
  secrets/        Google service account JSON。⚠️ 不要 commit
  logs/           保留
```

PostgreSQL 與 Redis 各自有 Docker volume（`postgres-data` / `redis-data`），**不在** `./data` 裡。完整備份：

```bash
# 備份 ./data
tar czf data-$(date +%F).tar.gz data/

# 備份 PostgreSQL
docker compose exec postgres pg_dump -U photo_grade photo_grade > db-$(date +%F).sql
```

清除非 DB 的檔案：

```bash
rm -rf ./data/*    # Linux/macOS
Remove-Item -Recurse -Force .\data\*    # Windows PowerShell
```

清除 DB（**不可恢復**）：

```bash
docker compose down -v
```

---

## 10. 環境變數總表

`docker-compose.yml` 已經為每個變數宣告 `${VAR:-default}` 預設值；`.env` 只需要寫想覆寫的項目。

| 變數 | 預設 | 必要性 | 說明 |
| --- | --- | --- | --- |
| `NODE_ENV` | `production` | 否 | 影響 cookie secure 判斷與 logging。 |
| `PORT` | `8080` | 否 | 容器內 listen port，也是 host bind port。 |
| `APP_BASE_URL` | `http://localhost:8080` | 公網部署 | OIDC callback、Host QR 入口的基底網址。 |
| `PUBLIC_ENTRY_URL` | 同 `APP_BASE_URL` | 否 | Host 頁面 QR 顯示的觀看入口；可獨立設定。 |
| `DATA_DIR` | `/data` | 否 | 容器內資料根目錄。 |
| `POSTGRES_PASSWORD` | `photo_grade` | **建議覆寫** | PostgreSQL 密碼，務必跟 `DATABASE_URL` 一致。 |
| `DATABASE_URL` | 自動指向 compose 內 postgres | 否 | 外接 DB 時可整段覆寫。 |
| `REDIS_URL` | `redis://redis:6379` | 否 | BullMQ 與 OIDC session 共用。 |
| `AUTH_MODE` | `basic` | 否 | `basic` 或 `oidc`。 |
| `AUTH_USERNAME` | `admin` | basic 必改 | Basic Auth 帳號。 |
| `AUTH_PASSWORD` | `change-me` | basic 必改 | Basic Auth 密碼。 |
| `SESSION_SECRET` | _（空）_ | OIDC 必填 | 用來簽 session cookie，建議至少 32 字元隨機字串。 |
| `COOKIE_SECURE` | `auto` | 否 | `auto` 在 production 自動 secure。 |
| `OIDC_ISSUER_URL` | _（空）_ | OIDC 必填 | OP 的 issuer URL。 |
| `OIDC_CLIENT_ID` | _（空）_ | OIDC 必填 | OP 端 client id。 |
| `OIDC_CLIENT_SECRET` | _（空）_ | OIDC 必填 | OP 端 client secret。 |
| `OIDC_REDIRECT_URI` | _（空，自動）_ | 否 | 留空時自動使用 `${APP_BASE_URL}/auth/callback`。**必須與 OP 端註冊一字不差**。 |
| `OIDC_SCOPES` | `openid profile email` | 否 | 自訂 scope。 |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | _（空）_ | 否 | 設定後 logout 會 redirect。 |
| `GOOGLE_SHEETS_ENABLED` | `false` | 啟用同步 | true 才會啟用 sheet sync worker；admin UI 也會顯示完整設定區。 |
| `GOOGLE_SHEET_ID` | _（空）_ | 否 | env-side fallback；admin 後台貼網址會優先生效。 |
| `GOOGLE_SHEET_WORKSHEET` | `Photo Grade Scores` | 否 | 工作表名稱。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | _（空）_ | 二擇一 | 整段 JSON 字串。 |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | `/data/secrets/google-service-account.json` | 二擇一 | 指向掛載到容器內的金鑰檔。 |
| `MAX_IMPORT_FILE_MB` | `50` | 否 | CSV/XLSX 上傳上限。 |
| `MAX_MEDIA_FILE_MB` | `200` | 否 | 單一作品下載上限。 |
| `IMPORT_ITEM_CONCURRENCY` | `1` | 否 | 同一批匯入內的並行下載/轉檔數。建議 `2-3` 起測，太高可能觸發 Google Drive 限流。 |
| `SOCKET_CORS_ORIGIN` | _（空）_ | 跨網域 | 留空 = same-origin；跨網域請填前端 origin（含 scheme）。 |
| `APP_IMAGE` / `WORKER_IMAGE` | `ghcr.io/ntut-cppc/photo-grade:latest` | 否 | Synology 純 image 部署用，可改成特定 commit 的 sha tag。 |

---

## 11. 本機開發

如果你是要修改程式碼而不是只部署：

```bash
npm install
npm run prisma:generate
npm run db:push          # 推 schema 到本機 DB（需要先 docker compose up -d postgres redis）
npm run build            # build 全部 workspace
npm run dev              # 啟 server（前端要另開）
npm run dev:web          # 另一個 terminal，啟 Vite dev server
npm test                 # 跑 vitest
```

開發時也可以直接用 `docker compose up -d postgres redis` 起 DB，再讓本機跑 server/web，省得整套重啟。

更詳細的開發守則請看 `AGENTS.md`。

---

## 12. 疑難排解

### 12.1 容器啟動後 `/api/health` 連不到

```bash
docker compose ps
docker compose logs --tail=200 app worker
```

- `app` 沒起來：八成是 `.env` 改錯（例如 `AUTH_MODE=oidc` 但 `OIDC_*` 沒填）。看 log 有 zod 驗證錯誤訊息會直接點出哪個變數。
- `postgres` healthcheck 失敗：第一次啟動偶爾要等 30 秒；確認 `POSTGRES_PASSWORD` 與 `DATABASE_URL` 裡的密碼一致。

### 12.2 匯入卡在 `QUEUED` / `PROCESSING 0/N`

打開瀏覽器 DevTools 看 `/api/admin/queue/status`（已登入時可直接 `curl -u admin:pwd http://localhost:8080/api/admin/queue/status`）：

- `workers` 陣列空 → worker 容器掛了，`docker compose up -d worker`。
- `counts.active=0, counts.wait=0` 但 DB 是 QUEUED → 通常是 worker 重啟了 BullMQ 沒帶動；重啟 worker 即可。
- 看 `docker compose logs worker`，`[media]` log 會顯示每張下載的時間與大小，下載慢的話考慮把 `IMPORT_ITEM_CONCURRENCY` 從 1 調到 2–3。

### 12.3 Google Sheet 同步「成功送分但試算表沒更新」

1. 在 `.env` 確認 `GOOGLE_SHEETS_ENABLED=true`。
2. `docker compose logs app worker | grep -i sheet`：常見錯誤訊息：
   - `The caller does not have permission`：試算表沒分享給 service account email。
   - `Requested entity was not found`：`GOOGLE_SHEET_ID` 拼錯，或試算表已被刪。
   - `Google Sheets sync target is not configured.`：admin 後台沒設、env 也沒填。
3. 進 `/admin` → Google Sheet 區塊看 service account email 是否與 JSON 內 `client_email` 一致；不一致代表金鑰沒讀到。
4. 同步是 retry-friendly：手動點 admin 上的「重試」或打 `POST /api/sheet-sync/drain` 強制 worker 撈 outbox。

### 12.4 想看版本

`docker compose logs app | grep "photo-grade server listening"` 會印：

```
photo-grade server listening on 8080 version=<commit sha>
```

`/api/health` 回應的 JSON 也包含 `version`。`unknown` 代表是本地 build 而非 GHCR image。

### 12.5 OIDC 登入按下去出 `{"error":"ERR syntax error"}`

代表 session 沒寫進 Redis。檢查：

- `REDIS_URL` 是否能連通（`docker compose exec app redis-cli -u $REDIS_URL ping`）。
- `SESSION_SECRET` 是否填了非空字串。
- 不要嘗試「加 OIDC_AUTHORIZATION_PARAMS workaround」——根因是 session store，不是 OP 端。

### 12.6 怎麼得知系統在跑哪個版本的 image

```bash
docker compose images
```

`app` / `worker` 的 image 欄位會顯示 tag（例如 `ghcr.io/ntut-cppc/photo-grade:latest`）；要拉新版：

```bash
docker compose pull
docker compose up -d app worker
```

---

## 授權

MIT。歡迎其他單位 fork 改作為自己的徵件評分系統。
