# 在 Synology NAS 上部署 Photo Grade

這份指南是寫給「想直接把 Photo Grade 跑在自家 / 學校 Synology NAS 上、不會用 SSH/CLI 也沒關係」的操作人員。所有設定都透過 DSM 圖形介面完成，不需要登入 NAS 的命令列。

預估時間：**約 60 分鐘**（含 DDNS / Let's Encrypt / OIDC 申請）。

> 看到 ★ 的地方代表「請改成你自己的值」。文件裡所有 `grade.example.com`、`change-me-please`、空白的 client id/secret 都是範例占位字，**不要照抄到正式環境**。

---

## 目錄

1. [前置條件](#1-前置條件)
2. [DSM 端準備](#2-dsm-端準備)
3. [準備共用資料夾與子目錄](#3-準備共用資料夾與子目錄)
4. [（選）放入 Google Service Account 金鑰](#4-選放入-google-service-account-金鑰)
5. [建立 Container Manager 專案](#5-建立-container-manager-專案)
6. [貼上並修改 docker-compose.yml](#6-貼上並修改-docker-composeyml)
7. [設定 DDNS / 對外網域](#7-設定-ddns--對外網域)
8. [建置並啟動容器](#8-建置並啟動容器)
9. [設定反向代理（最重要）](#9-設定反向代理最重要)
10. [申請 Let's Encrypt 憑證並指派給反向代理](#10-申請-lets-encrypt-憑證並指派給反向代理)
11. [完整功能測試](#11-完整功能測試)
12. [（選）用 Synology DSM 本身當 OIDC 提供者](#12-選用-synology-dsm-本身當-oidc-提供者)
13. [日後升級版本](#13-日後升級版本)
14. [備份策略](#14-備份策略)
15. [疑難排解](#15-疑難排解)

---

## 1. 前置條件

- **DSM 7.2** 以上（DSM 6 / 7.0 沒有「專案」這個功能）。
- **Container Manager** 套件（DSM 7.2 起取代舊的 Docker 套件）。
- **可解析的對外網域**：可用 Synology 免費 DDNS（`*.synology.me`），或你自己的網域。
- 路由器可以把 **80 與 443 port forward 到 NAS**——Let's Encrypt 自動驗證需要 80。
- NAS 至少 **5 GB 可用空間**（作品原始檔比較吃儲存）。
- 一個 **Google 帳號**（要做 Sheet 同步才需要；可後補）。

> 不確定你的 DSM 版本？打開 DSM → 「控制台」→「資訊中心」最上面就會看到。

---

## 2. DSM 端準備

### 2.1 安裝 Container Manager

1. DSM 右上角 → **套件中心**。
2. 搜「Container Manager」→ **安裝**。
3. 安裝完打開來看一下，左邊應該有「概觀 / 容器 / 映像 / 網路 / **專案** / 登錄伺服器」。

### 2.2 確認管理員權限

部署過程會建立資料夾、改控制台設定，請確定你登入的帳號屬於 **administrators 群組**（DSM → 控制台 → 使用者與群組 → 找你的帳號 → 編輯 → 成員群組）。

---

## 3. 準備共用資料夾與子目錄

Photo Grade 的所有持久資料都會放在 NAS 上的某個資料夾裡，這樣以後從 File Station 就能直接看到/備份。

### 3.1 建立共用資料夾

1. **控制台 → 共用資料夾 → 新增**。
2. 名稱：`docker`（你已經有就跳過，本指南統一假設名稱叫 `docker`）。
3. 描述：可填可不填。
4. 取消勾選「將此共用資料夾於『網路上的芳鄰』中隱藏」（不必要，但方便除錯）。
5. 加密、配額照預設即可，按下一步直到完成。

### 3.2 建立子資料夾

打開 **File Station**，進入 `docker/`，建立以下結構：

```
docker/
└── photo-grade/
    ├── data/
    │   └── secrets/
    ├── postgres-data/
    └── redis-data/
```

操作流程：

1. `docker/` 底下右鍵 → **建立 → 建立資料夾**，命名 `photo-grade`。
2. 進到 `docker/photo-grade/`，建立 `data`、`postgres-data`、`redis-data` 三個子資料夾。
3. 進到 `docker/photo-grade/data/`，建立 `secrets` 資料夾。

> **不要**手動建立 `originals/`、`previews/`、`thumbnails/` 這些——容器啟動時會自動建。

### 3.3 為什麼用這種「bind mount」方式

DSM 上預設的 docker compose 通常會建議你用「named volume」（讓 Docker 自己藏起來）。但是在 NAS 上強烈建議改用我們這種 bind mount：

- 你可以用 File Station 直接看 / 下載 / 備份檔案。
- 容易整合 Hyper Backup / Snapshot Replication。
- 換 NAS 時直接複製整個 `docker/photo-grade/` 即可遷移。

---

## 4. （選）放入 Google Service Account 金鑰

如果你**不打算做 Google 試算表同步**，可以直接跳到第 5 章。同步可以日後再加，不影響現場評分。

申請 service account 的流程請看主 [README §4](../README.md#4-申請-google-sheets-api-service-account)。申請完你會下載到一個 `.json` 檔。

把它**改名為 `google-service-account.json`**，用 File Station 上傳到：

```
docker/photo-grade/data/secrets/google-service-account.json
```

> ⚠️ 這個檔案等同於密碼。請把這個共用資料夾的權限設成只有 administrators 可讀：
>
> 控制台 → 共用資料夾 → 點 `docker` → 編輯 → 權限 → 把不必要的帳號權限改成「無存取權限」。

別忘了：第 6 章 compose 裡 `GOOGLE_SHEETS_ENABLED` 要改成 `"true"`，否則 worker 不會啟用同步。

---

## 5. 建立 Container Manager 專案

「專案」就是 DSM 對 docker-compose 的包裝。

1. 打開 **Container Manager → 專案**。
2. 點上方 **建立**。
3. 填寫：
   - **專案名稱**：`photo-grade`
   - **路徑**：選 `docker/photo-grade`（按右邊的資料夾圖示瀏覽）。
   - **來源**：選 **「建立 docker-compose.yml」**。
4. 下面有個大文字框，準備貼 compose 檔案——進入下一節。

> 如果跳出「該路徑下已存在 docker-compose 檔案」的提示，代表這個專案路徑之前用過。請選「使用現有的 compose」覆蓋，或先把舊檔案搬走再建立。

---

## 6. 貼上並修改 docker-compose.yml

本專案 repo 裡有一份預先寫好的 Synology 範本：[`docker-compose.synology.example.yml`](../docker-compose.synology.example.yml)。

### 6.1 在 GitHub 上直接複製

1. 用瀏覽器打開 <https://github.com/NTUT-CPPC/photo-grade>。
2. 點 `docker-compose.synology.example.yml`。
3. 點右上角的 **Copy raw file**（或 **Raw** → 全選 → Ctrl+C）。
4. 回到 Container Manager 的文字框 → 貼上。

### 6.2 至少要改的地方

打開貼好的內容，找到所有 `★` 標記，至少改下面這些：

#### 對外網址（一定要改）

```yaml
APP_BASE_URL: https://grade.example.com    # ★ 換成你的網域
PUBLIC_ENTRY_URL: https://grade.example.com  # ★ 通常與上面相同
```

如果你只想內網用、之後再公開，可以先填 `http://<NAS-IP>:8080`，但 **OIDC 與 Google Sheet 同步以後還是要走 https，建議第一次部署就把網域處理好**。

#### Auth 模式（二擇一）

**最簡單：Basic Auth（單一共用帳密）**

```yaml
AUTH_MODE: basic
AUTH_USERNAME: admin
AUTH_PASSWORD: 換成一段你記得住的強密碼   # ★ 至少 12 字
```

**進階：OIDC（公司 / 學校的 SSO，例如 Synology DSM SSO、Keycloak、Auth0、Google）**

```yaml
AUTH_MODE: oidc
SESSION_SECRET: <貼一段 32+ 字元隨機字串>   # ★ 用 openssl rand -hex 32 產
OIDC_ISSUER_URL: https://op.example.com    # ★ 例如 Synology：https://你的-DSM-DDNS/webman/sso
OIDC_CLIENT_ID: <client id>                # ★ OP 端註冊應用後拿到
OIDC_CLIENT_SECRET: <client secret>        # ★
OIDC_REDIRECT_URI: ""                       # 留空會自動用 ${APP_BASE_URL}/auth/callback
```

> ⚠️ **`SESSION_SECRET` 與 `OIDC_CLIENT_SECRET` 不要 commit 到任何 git repo、也不要貼到聊天記錄。** 它們等同 root 密碼。

OIDC 設定細節請看 §12（用 Synology 自己當 OP）或主 [README §6](../README.md#6-使用-oidc-單一登入進階可略)。

#### 資料庫密碼（建議改）

```yaml
DATABASE_URL: postgresql://photo_grade:<新密碼>@postgres:5432/photo_grade?schema=public
...
postgres:
  environment:
    POSTGRES_PASSWORD: <新密碼>   # 與 DATABASE_URL 內那段必須完全一致
```

兩處密碼**必須一致**——不然 app 會連不上 DB。

#### Google Sheet 同步（選用）

如果第 4 章已經放好 JSON 金鑰：

```yaml
GOOGLE_SHEETS_ENABLED: "true"
GOOGLE_SHEET_WORKSHEET: Photo Grade Scores
GOOGLE_SERVICE_ACCOUNT_FILE: /data/secrets/google-service-account.json
GOOGLE_SERVICE_ACCOUNT_JSON: ""
```

`GOOGLE_SHEET_ID` 可以留空——之後在 admin 後台貼試算表網址即可。

### 6.3 不要做的事

- ❌ **不要**改 `DATA_DIR`、`PORT`、`DATABASE_URL` 主機名（postgres/redis）的部分。
- ❌ **不要**把 `OIDC_CLIENT_SECRET`、`SESSION_SECRET`、`POSTGRES_PASSWORD`、`GOOGLE_SERVICE_ACCOUNT_JSON` 提交到 GitHub。
- ❌ **不要**直接把 NAS 的 8080 對公網開放——後面我們會用反向代理走 443。

按 **下一步**，先**不要**勾「立即建置」（要先處理 DDNS / 憑證 / 反向代理）。完成建立。

---

## 7. 設定 DDNS / 對外網域

如果你已經有自己的網域（例如 `grade.example.com`，A record 指向 NAS 公網 IP），直接跳到第 8 章。

### 7.1 啟用 Synology DDNS（免費 `*.synology.me`）

1. 控制台 → **外部存取 → DDNS → 新增**。
2. **服務供應商**：Synology。
3. **主機名稱**：自己取，例如 `myschool-judge`，最終會變 `myschool-judge.synology.me`。
4. **電子郵件**：填 Synology 帳號 email；如果還沒建 Synology 帳號它會引導你做。
5. 按 **測試連線**——會的話顯示「正常」。
6. 按 **確定**。

> 用 Synology DDNS 不需要設 A record；Synology 會自動把這個 hostname 解析到你 NAS 的公網 IP。

### 7.2 路由器 Port Forwarding

進你家 / 機房的路由器後台，把：

- 外網 **TCP 80** → NAS 內網 IP **80**
- 外網 **TCP 443** → NAS 內網 IP **443**

> Let's Encrypt 一定要 80 才能驗證；HTTPS 對外要 443。**不需要**把 8080 forward 出去——所有流量都會經過 443 反向代理。

### 7.3 確認可達

用手機 4G/5G 開瀏覽器打 `http://你的網域`，應該會看到 DSM 的登入畫面（或 404，視 DSM 預設首頁設定）。看不到代表 port forwarding 沒通，先排除這一關再繼續。

---

## 8. 建置並啟動容器

> ⚠️ **這一步要先做**。DSM 的反向代理需要「目的地有東西在聽」才能正常驗證；憑證的「指派服務」步驟也要等反向代理項目存在後才能在下拉選單裡看到，所以順序一定是 **先啟動容器 → 設反向代理 → 申請憑證並指派**，三個步驟不要顛倒。

回到 **Container Manager → 專案 → photo-grade**。

1. 點 **建置**（如果第 5 章建立專案時沒勾「立即建置」）。
2. DSM 會開始拉 image（`postgres:17`、`redis:7`、`ghcr.io/ntut-cppc/photo-grade:latest`）。第一次大約 5–10 分鐘。
3. 完成後容器列表四個都應顯示 **執行中**：
   - `photo-grade-app-1`
   - `photo-grade-worker-1`
   - `photo-grade-postgres-1`
   - `photo-grade-redis-1`

### 8.1 看 log 確認啟動成功

Container Manager → 容器 → 點 `photo-grade-app-1` → **詳細資料 → 紀錄**。

正常啟動會看到一行：

```
photo-grade server listening on 8080 version=<commit sha>
```

這就代表 image 拉到、DB schema 推了、server 起來了。`photo-grade-worker-1` 那邊應該看到：

```
[worker] ready and listening on queue 'photo-grade'
```

如果看到一直 restart 或 fatal error，請對照 §15 疑難排解。

### 8.2 用 LAN IP 快速驗證

這時候還沒有反向代理跟憑證，但可以從同網段的電腦/手機開瀏覽器測：

```
http://<NAS 內網 IP>:8080/api/health
```

回應應該是：

```json
{ "ok": true, "version": "..." }
```

> 💡 LAN 上能通就代表容器跑得起來；公網網域 (https://grade.example.com) 此時還會 502 / 拒絕連線，這是正常的——下一章設好反向代理後才會通。

---

## 9. 設定反向代理（最重要）

這一步決定了「公網來的 https 流量怎麼導給 8080 容器」。**Photo Grade 的 Socket.IO 需要 WebSocket 升級，所以反向代理一定要開 WebSocket，否則主持切換不會即時同步。**

1. 控制台 → **登入入口 → 進階 → 反向代理伺服器**。
2. 點 **新增**。

### 9.1 一般

- **說明**：`photo-grade`
- **來源**：
  - 通訊協定：**HTTPS**
  - 主機名稱：`grade.example.com`（與 §7 一致）
  - 連接埠：**443**
  - ✅ 啟用 HSTS（建議）
  - ✅ 啟用 HTTP/2（建議）
- **目的地**：
  - 通訊協定：**HTTP**
  - 主機名稱：`localhost`
  - 連接埠：**8080**

### 9.2 自訂標頭（**必填，否則 WebSocket 會壞**）

切到 **自訂標頭** 分頁 → **新增 → WebSocket**（DSM 7.2 有預設樣板，會自動填以下兩條）：

| 標頭名稱 | 值 |
| --- | --- |
| `Upgrade` | `$http_upgrade` |
| `Connection` | `$connection_upgrade` |

如果 DSM 沒有 WebSocket 樣板（舊版），手動加這兩條一樣可以。

接著手動再加三條（這些是讓後端 OIDC / cookie 行為正確的關鍵）：

| 標頭名稱 | 值 |
| --- | --- |
| `X-Forwarded-Proto` | `https` |
| `X-Forwarded-Host` | `$host` |
| `X-Real-IP` | `$remote_addr` |

> 說明：app 啟動時 `trust proxy = 1`，會用這些 header 推算真實 callback URL 與 secure cookie 判斷。沒加的話 OIDC 登入會卡在 callback。

### 9.3 進階設定

切到 **進階設定** 分頁：

- ✅ 進階訊息頭代理（如果有看到此選項）

按 **儲存**。

### 9.4 先用 https 測一次（憑證警告是正常的）

打 <https://grade.example.com/api/health>，瀏覽器**會顯示「不安全 / 憑證錯誤」**——因為這時候反向代理還在用 DSM 預設的自簽憑證。先點「進階 → 仍要前往」忽略警告，看到 JSON：

```json
{ "ok": true, "version": "..." }
```

代表反向代理已經把流量導給容器。下一章把憑證換成 Let's Encrypt 後，警告就會消失。

> ⚠️ 如果這時候打 https://grade.example.com/api/health 是 **502 / 504 / 拒絕連線**：先回 §8 確認容器是 running，再檢查反向代理「目的地」是否填 `localhost:8080`（不是 LAN IP）。

---

## 10. 申請 Let's Encrypt 憑證並指派給反向代理

DSM 的「指派憑證給服務」**只列出已存在的反向代理項目**，所以這一步必須在 §9 之後做。

### 10.1 申請憑證

1. 控制台 → **安全性 → 憑證 → 新增 → 新增憑證**。
2. 選 **「從 Let's Encrypt 取得憑證」** → 下一步。
3. 填：
   - **網域名稱**：`grade.example.com`（與 §7 一致）
   - **電子郵件**：你的真實 email（憑證快過期會通知）
   - **主旨替代名稱**：可留空，或填 `www.grade.example.com` 之類的別名。
4. 按 **完成**。DSM 會在背景驗證並下載憑證；過程通常 30 秒到 2 分鐘。

完成後，回到憑證列表會看到一張新的憑證，到期日約 90 天後（DSM 會自動續期）。

### 10.2 指派憑證給反向代理服務（**這一步常被漏掉**）

申請完憑證**不會自動套用**，你要手動把它指給 §9 建立的反向代理項目，否則公網看到的還是 DSM 預設自簽憑證。

1. 在憑證列表上方點 **設定**。
2. 跳出的對話框會列出所有「服務」。找這一列：
   ```
   服務：grade.example.com
   類型：反向代理
   ```
3. 該列「憑證」下拉換成你剛申請的 Let's Encrypt 憑證 → **確定**。

> ⚠️ **如果下拉裡找不到 `grade.example.com` 這列反向代理服務**：代表 §9 的反向代理項目沒建好或沒儲存。回 §9 檢查後再回來這步。**這就是為什麼一定要先反向代理、再憑證**——順序顛倒會讓「服務」清單裡沒有可指派的目標。

> 順帶一提：如果這台 NAS 還會跑 DSM 自己的 HTTPS（5001 port）、Drive Server、相片管理等，也可以在同一個對話框把它們指到同一張憑證，全部集中管理。

### 10.3 確認

再打一次 <https://grade.example.com/api/health>，這次瀏覽器網址列應該是綠色鎖頭、沒有警告，回應一樣是：

```json
{ "ok": true, "version": "..." }
```

到這裡網路層全部就緒。

---

## 11. 完整功能測試

| 用途 | 網址 |
| --- | --- |
| 公開觀看 | https://grade.example.com/view |
| 主辦後台 | https://grade.example.com/admin |
| 主持機 | https://grade.example.com/host |
| 評審計分 | https://grade.example.com/score |

第一次進 `/admin`：

- **basic 模式**：跳出瀏覽器原生帳密框，輸入你在 compose 改的 `AUTH_USERNAME` / `AUTH_PASSWORD`。
- **oidc 模式**：自動 redirect 到你的 OP 登入頁。

建議再做兩個快速測試：

1. **WebSocket 通了沒**：開 `/host`，按 Next；同時另一台裝置開 `/view`，主持切換的當下 view 應該即時跟上。如果不會跟上，回頭檢查 §9.2 的 `Upgrade` / `Connection` 兩條 header。
2. **OIDC callback 通了沒**（只有 oidc 模式）：登入流程結束後應該回到 `/admin`，網址列乾淨。如果停在 OP 端或畫面顯示 OIDC 錯誤，回頭檢查 §9.2 的 `X-Forwarded-Proto: https`。

---

## 12. （選）用 Synology DSM 本身當 OIDC 提供者

如果你想讓「DSM 帳號」就能登入 Photo Grade，DSM 7.2 內建 SSO Server 可以擔任 OIDC OP。

### 12.1 啟用 SSO Server

1. **套件中心** → 搜 **「SSO Server」** → 安裝。
2. 開啟 SSO Server → **OIDC** 分頁。
3. 注意上方顯示的 **Issuer URL**，通常會長這樣：
   ```
   https://你的-DSM-DDNS/webman/sso
   ```
   （要從外部連到的話這個 hostname 必須對外可達；如果你的 NAS 同時是 DSM 與 Photo Grade，可以共用同一張憑證。）

### 12.2 註冊 Photo Grade 應用

1. 在 SSO Server → OIDC → **應用程式 → 新增**。
2. 填：
   - **名稱**：`Photo Grade`
   - **重新導向 URI**：`https://grade.example.com/auth/callback`
     （與你 compose 裡 `APP_BASE_URL` 對應，**一字不差**）
   - **scope**：`openid`、`profile`、`email`（其他依需求）
3. 儲存後會給你 **Client ID** 和 **Client Secret**。**Secret 只會出現一次，請立刻複製**。

### 12.3 把值填回 compose

回到 Container Manager → 專案 → photo-grade → 編輯 → docker-compose.yml：

```yaml
AUTH_MODE: oidc
SESSION_SECRET: <openssl rand -hex 32 產的字串>
OIDC_ISSUER_URL: https://你的-DSM-DDNS/webman/sso
OIDC_CLIENT_ID: <剛拿到的 client id>
OIDC_CLIENT_SECRET: <剛拿到的 client secret>
OIDC_REDIRECT_URI: ""
OIDC_SCOPES: openid profile email
```

按儲存，再依 §13 的步驟讓新設定生效。

> 提醒：DSM SSO Server 的 issuer URL 結尾**沒有**斜線；某些 OP 會堅持 redirect URI 結尾斜線一致，請保持與你註冊時完全相同。

---

## 13. 日後升級版本

當官方推出新 image（GHCR 上 `:latest` tag 會自動跟著 main 分支更新），或你改了 compose 內容（例如更新 OIDC 設定）想讓它生效，**步驟是固定的四步**：

> ⚠️ **DSM 的「動作 → 建立」預設不會 re-pull image**——只要本地還有同名 image 它就會直接用既有的那份重建容器。所以**升級到新版必須先把舊 image 砍掉**，否則拉不到新版。

1. **動作 → 停止**（在 photo-grade 專案內）：把整個專案停下來。
2. **動作 → 清除**（在 photo-grade 專案內）：清掉這個專案的容器，但 `./data`、`./postgres-data`、`./redis-data` 這些 bind mount 的資料**不會**動。
3. **映像檔 → 刪除**：切到 Container Manager 左側的「**映像**」分頁，找到 `ghcr.io/ntut-cppc/photo-grade:latest`（app 跟 worker 共用同一份），勾選 → 刪除。`postgres:17` 與 `redis:7` 這兩個 base image 通常版本變動少，不必每次刪，等想升級到 PostgreSQL 18 時再砍。
4. **回到專案 → 動作 → 建立**：DSM 找不到本地 image 就會自動 `docker pull` 拉最新版，再重新建立容器。

> 💡 「清除」與「刪除映像」這兩步很多人會跳，結果就是按了「建立」一萬次都還是跑舊 image。記得每次升級至少要走完 1→2→3→4 整套。
>
> 💡 如果只是改了 compose 的環境變數（不需要新 image），可以省略步驟 3：1→2→4 即可，會用既有 image 重新建立容器。

### 13.1 確認真的升級到新版本

`Container Manager → 容器 → photo-grade-app-1 → 紀錄`，找最近的：

```
photo-grade server listening on 8080 version=<commit sha>
```

`version=` 那段就是 image 帶進來的 commit。如果跟你升級前同一個 sha，代表 step 3「映像檔刪除」沒做或拉到舊版；回去重做。如果顯示 `unknown` 代表你不是在用 GHCR image，是本地 build 的舊版。

### 13.2 鎖在特定版本

不想跟著 `:latest` 走的話，把 compose 改成：

```yaml
app:
  image: ghcr.io/ntut-cppc/photo-grade:sha-abcdef1
worker:
  image: ghcr.io/ntut-cppc/photo-grade:sha-abcdef1
```

`sha-` 後面接 commit SHA 前 7 碼。可在 [GHCR 套件頁面](https://github.com/NTUT-CPPC/photo-grade/pkgs/container/photo-grade) 看可用 tag。

> 鎖定 sha tag 後升級時也是同樣四步：改完 compose → 動作>停止 → 動作>清除 → 映像>刪除舊的 → 動作>建立。

---

## 14. 備份策略

NAS 的好處就是備份很方便。整個 `docker/photo-grade/` 資料夾就是 Photo Grade 的全部狀態。

### 14.1 用 Hyper Backup（推薦）

1. 套件中心 → 安裝 **Hyper Backup**。
2. 新增備份任務：
   - 來源：`docker/photo-grade/`
   - 目的地：另一個共用資料夾、外接硬碟、或 C2 雲端。
   - 排程：每天 1 次（資料量小的話）。
3. ⚠️ **建議備份前先停容器**——直接複製 `postgres-data/` 在 PostgreSQL 寫入時不一定 consistent。
   - 比較簡單的做法：在 Hyper Backup 的「執行前指令」設定停止專案，「執行後指令」啟動：
     ```bash
     # before
     /usr/local/bin/docker compose -f /volume1/docker/photo-grade/docker-compose.yml down
     # after
     /usr/local/bin/docker compose -f /volume1/docker/photo-grade/docker-compose.yml up -d
     ```
   - 或者乾脆只備份 `data/`，DB 那邊另外做 dump（見下節）。

### 14.2 DB dump（不停機備份）

DSM Container Manager → 容器 → `photo-grade-postgres-1` → **詳細資料 → 終端 → 建立**：

```bash
pg_dump -U photo_grade photo_grade > /var/lib/postgresql/data/backup-$(date +%F).sql
```

dump 出來的檔案會出現在 NAS 的 `docker/photo-grade/postgres-data/backup-2026-01-01.sql`。記得定期清舊的。

> 還原：把 `.sql` 檔放進 postgres-data 後在容器終端執行 `psql -U photo_grade photo_grade < backup-2026-01-01.sql`。

### 14.3 不能漏的東西

| 內容 | 為什麼 |
| --- | --- |
| `data/originals/` | 原始作品檔，掉了就再也撈不回來。 |
| `data/output/` | 之前的評分匯出 CSV，比 DB 安全。 |
| `data/secrets/` | Google service account JSON。 |
| `postgres-data/` | 評分、評審名單、設定。 |
| `docker-compose.yml` | 所有設定都在這裡（包含 secrets，**離線備份**）。 |

`previews/` 與 `thumbnails/` 不重要——丟了的話可以從 originals 重產。

---

## 15. 疑難排解

### 15.1 建置失敗：`Error response from daemon: pull access denied`

代表 DSM 拉不到 GHCR image。GHCR 的公開 image 不需要登入，但偶爾遇到 DNS / 防火牆問題：

1. **Container Manager → 登錄伺服器 → 新增 → ghcr.io**：
   - URL：`https://ghcr.io`
   - 不需要帳密。
2. 重試建置。

如果還是不行，可能是 NAS 對外網路有問題（試 `Ping ghcr.io`）；先解決對外連線再回來。

### 15.2 容器一直 restart

代表啟動時就 crash。看 log：

- `❌ AUTH_MODE=oidc 但 OIDC_*  / SESSION_SECRET 沒填`：zod 會直接 fail，訊息會點出哪個變數。回去 compose 補齊。
- `❌ Database connection refused`：`POSTGRES_PASSWORD` 與 `DATABASE_URL` 內密碼不一致；改一致後 **務必同時清掉 postgres-data**（File Station 把 `docker/photo-grade/postgres-data/` 內容刪光），不然 postgres 會用舊密碼初始化的資料夾繼續壞下去。
- `❌ ENOENT: /data/secrets/google-service-account.json`：你開了 `GOOGLE_SHEETS_ENABLED=true` 但金鑰沒上傳。要嘛上傳檔案，要嘛改回 `false`。

### 15.3 OIDC 登入卡住 / `{"error":"ERR syntax error"}`

99% 是反向代理少帶 header。檢查 §9.2 的五條 header 都有：`Upgrade` / `Connection` / `X-Forwarded-Proto` / `X-Forwarded-Host` / `X-Real-IP`。

特別是 `X-Forwarded-Proto: https`——少了它，server 會把 callback URL 推算成 `http://...`，OP 端會拒絕。

### 15.4 主持切換作品但評審頁不會即時跟上

WebSocket 沒通。檢查：

- 反向代理 §9.2 的 `Upgrade: $http_upgrade` 和 `Connection: $connection_upgrade` 兩條 header 都有加。
- 瀏覽器 DevTools → Network → WS 標籤，應該看到 `/socket.io/...` 的連線是 `101 Switching Protocols`。如果是 `400` 或 `200` 代表沒升級成 WS。

### 15.5 匯入卡在 `QUEUED`

開 admin 頁面右上角紅字會直接告訴你問題；通常是 `worker offline`。Container Manager → 容器 → `photo-grade-worker-1` 看狀態：

- 若是 stopped：點啟動。
- 若一直 restart：看 log，通常與 §15.2 同樣的環境變數錯誤。

或在瀏覽器（要先登入）打 https://grade.example.com/api/admin/queue/status，會回 worker 與 queue 詳細狀況。

### 15.6 想完全砍掉重來

**會刪掉所有作品與評分**：

1. Container Manager → 專案 → photo-grade → **動作 → 停止**。
2. **動作 → 清除**（清掉容器）。
3. File Station 把 `docker/photo-grade/postgres-data/` 與 `data/` 內容**全刪**（保留資料夾本身）。
4. 回 Container Manager → 專案 → **動作 → 建立**。

如果只是想保留 DB 但重抓圖片，第 3 步只刪 `data/originals/`、`data/previews/`、`data/thumbnails/` 三個子資料夾。

### 15.7 NAS 重開機後容器沒自動起來

Compose 內所有 service 都有 `restart: unless-stopped`，理論上開機會自動起。如果沒：

- 控制台 → **工作排程器 → 新增 → 觸發的工作 → 開機**。
- 使用者：`root`，命令：`/usr/local/bin/synopkg start ContainerManager`。

通常不需要這樣，但偶爾 DSM 升級後 docker daemon 起得比 Container Manager 慢，這個排程可以保險。

### 15.8 想看版本

Container Manager → 容器 → `photo-grade-app-1` → **紀錄**，找：

```
photo-grade server listening on 8080 version=abc1234
```

或在瀏覽器打 https://grade.example.com/api/health（不用登入）。

---

完成這份指南後，你應該有：

- 一個跑在 NAS 上、能對外用 HTTPS 訪問的 Photo Grade 服務。
- 反向代理 + Let's Encrypt 自動續期。
- （選）DSM 帳號就能登入的 SSO 設定。
- （選）Google 試算表自動同步。
- File Station 看得到的所有資料夾結構，方便備份。

需要面向操作人員的「使用方式」（怎麼設評審、匯入作品、現場切換等），請看主 [README §7 日常操作](../README.md#7-日常操作)。
