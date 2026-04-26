# Photo Grade

Docker-first 攝影評分系統。它取代舊 Flask 臨時評分器，提供後台匯入、作品下載/轉檔、主持同步、計分、評審瀏覽與 Google Sheet 同步。

## 快速啟動

1. 複製環境設定：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 編輯 `.env`，至少修改三組帳密：

   ```env
   HOST_USERNAME=host
   HOST_PASSWORD=change-me-host
   SCORE_USERNAME=score
   SCORE_PASSWORD=change-me-score
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=change-me-admin
   ```

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

`/host`、`/score`、`/admin` 需要 HTTP Basic Auth；`/view` 不需要登入。

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
- `/host`、`/score`、`/admin` 未登入會要求帳密。
- Admin 匯入 sample CSV 後，`data/originals`、`data/previews`、`data/thumbnails`、`data/metadata` 會產生檔案。
- Host 切換作品後 Score/View 同步。
- Score 送出後 Host 顯示即時送分提示。

## Admin 內建工具

- 評審設定：可在 Admin 頁面新增、刪除、拖曳排序評審名字，按 `儲存` 後寫回。Score 頁面會依完整評審名單產生欄位，不限 3 位。
- 匯入範本下載：Admin 頁面可直接下載 CSV 與 Excel 範本，再填入投稿資料後做 dry-run/confirm。
- 按鈕提示：`Dry run` 和 `Confirm` 按鈕有 tooltip 說明操作差異。
