# 人生清單 ‧ 待辦事項

純前端網站（HTML + CSS + JS），不需要安裝任何軟體或建置工具，可以直接上傳到 GitHub、用 GitHub Pages 部署，資料庫使用 Firebase Firestore，兩人各自用自己的 Google 帳號登入，即時共同編輯同一份清單。

這個專案改編自「生活用品採購庫存記錄」框架，保留同樣的技術架構（Firebase 登入＋即時同步、閒置自動登出、純前端無建置流程），但把內容換成兩個新主題：

- **🌱 人生清單**：長期想做的事（旅行、學習、成就、體驗…），沒有強制期限，達成後打勾即可，可以加星號標記最想做的項目。
- **✅ 待辦事項**：日常任務，有到期日、優先度、可設定「重複」（每天／每週／每月），逾期會特別標示出來。

## 檔案說明

- `index.html`：網站主畫面（人生清單 / 待辦事項 兩個分頁）
- `style.css`：暖色系文具手帳風配色與版面樣式，含手機／平板／電腦的自適應排版
- `app.js`：所有功能邏輯（新增、修改、刪除、打勾完成、重複待辦的到期日自動推進、篩選、搜尋）
- `firebase-config.js`：**要自己填**的 Firebase 專案設定值
- `favicon.svg` / `favicon-32.png` / `apple-touch-icon.png`：網站的小圖示（瀏覽器分頁、手機加到主畫面時顯示的icon）

## 功能重點

- **人生清單**：分類篩選、狀態篩選（全部／進行中／已達成）、搜尋、達成率進度條、⭐ 收藏標記最想做的項目、備註欄位記錄為什麼想做或需要準備什麼。
- **待辦事項**：到期日、三段優先度（高／中／低）、四種重複頻率（不重複／每天／每週／每月）、負責人欄位（適合兩人分工）、逾期會用紅色標示，快到期（2 天內）會用黃色標示。
- **可重複的待辦**：打勾完成後，系統會自動把到期日往後推（依重複頻率），並記錄「上次完成日」，這筆待辦不會消失，而是變成下一輪要做的事——適合繳費、家事、運動這類固定週期的任務。
- **閒置自動登出**：預設閒置 60 分鐘沒有任何操作就會自動登出，需要重新用 Google 帳號登入。想調整這個時間，改 `app.js` 最上面的 `IDLE_TIMEOUT_MINUTES` 這個數字即可（單位是分鐘，改成 `0` 就是關閉這個機制）。

## 登入是怎麼運作的（Google 帳號登入＋email 白名單）

打開網站會先看到「登入」畫面，按「使用 Google 帳號登入」用你自己的 Google 帳號登入即可，**不需要另外申請帳號、也不用共用密碼**。

兩人各自用自己的 Google 帳號登入，卻能同步看到同一份清單，原理是：資料庫裡的清單放在一個**固定的共用路徑**（`shared/household/...`），不是放在個別使用者自己的路徑底下；而「誰可以連到這個共用路徑」則是靠 Firestore 安全性規則裡的 **email 白名單**把關——只有規則裡列出的那幾個 Google 帳號 email 才能讀寫，其他人即使打開網址、按登入，也會被規則擋下、看不到任何資料。設定步驟在下面「部署前要做的事」。

**這個方式比原本信箱＋密碼共用帳號更安全**：不用共用密碼，各自用自己原本的 Google 帳號（通常已經有兩步驟驗證），也不用擔心密碼被公用電腦記住。登出時按頁首的「登出」即可；「閒置自動登出」（見上方）機制也照樣適用。

## 把程式碼公開在 GitHub 上安全嗎？

安全，這是 Firebase 官方認可的常見做法。`firebase-config.js` 裡的 `apiKey` 等設定值**不是密碼**，只是告訴瀏覽器要連到哪個 Firebase 專案，本身沒有讀寫資料的權限；真正決定「誰能讀寫」的是 Firestore 的安全性規則（下面「部署前要做的事」那段的 email 白名單），而不是把設定值藏起來。就算有陌生人打開這個網站、用自己的 Google 帳號登入，只要他的 email 不在白名單裡，規則就會直接擋下讀寫請求。

## 部署前要做的事

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立一個新專案（免費方案即可）。
2. 在專案設定 → 一般 → 我的應用程式，新增一個「網頁應用程式」，把拿到的設定值填入 `firebase-config.js` 的 6 個欄位。
3. 到「Authentication」功能 → Sign-in method，啟用「Google」這個登入方式（預設是關閉的，需要手動啟用，選一個支援電子郵件即可，通常會要求填一個專案的公開名稱）。
4. 同樣在「Authentication」→ Settings → Authorized domains，把你的 GitHub Pages 網域加進去（例如 `你的帳號.github.io`）——沒加的話登入會出現 `auth/unauthorized-domain` 錯誤。
5. 建立 Firestore 資料庫（原生模式即可）。資料會存在 `shared/household/lifeGoals` 與 `shared/household/todos` 底下，網站第一次寫入時自動建立，不用手動建立。
6. 到 Firestore 的「規則」分頁，貼上以下規則，把 `"你的Gmail"` 與 `"伴侶的Gmail"` 換成你們兩人實際登入用的 Google 帳號 email（要用登入時的那個 email，兩個都要換掉；之後如果要再加第三人，用逗號加進陣列裡即可）：
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /shared/household/{document=**} {
         allow read, write: if request.auth != null
           && request.auth.token.email_verified == true
           && request.auth.token.email in ["你的Gmail", "伴侶的Gmail"];
       }
     }
   }
   ```
7. 把整個資料夾（這 8 個檔案）上傳到你的 GitHub repository，開啟 GitHub Pages 即可瀏覽。

## 資料結構

**`lifeGoals`（人生清單項目）**

| 欄位 | 說明 |
|---|---|
| title | 想做的事 |
| category | 分類（旅行探索／學習成長／職涯成就／健康體能／人際關係／財務目標／體驗清單／其他） |
| targetYear | 目標年份（可留空） |
| note | 備註（可留空） |
| favorite | 是否收藏（⭐） |
| completed | 是否已達成 |
| completedDate | 達成日期 |
| createdAt / createdBy | 建立時間／建立者信箱 |

**`todos`（待辦事項）**

| 欄位 | 說明 |
|---|---|
| title | 事項內容 |
| category | 分類（工作／生活／家庭／購物／其他） |
| dueDate | 到期日（可留空） |
| priority | 優先度（高／中／低） |
| recurring | 重複頻率（none／daily／weekly／monthly） |
| assignee | 負責人（可留空） |
| note | 備註（可留空） |
| completed | 是否完成（重複性待辦完成後會自動重置為 false，並把到期日往後推） |
| completedDate | 完成日期（僅不重複的待辦會用到） |
| lastCompletedDate | 上次完成日期（重複性待辦用來記錄歷史） |
| createdAt / createdBy | 建立時間／建立者信箱 |

之後如果想調整分類選項，直接編輯 `app.js` 最上面的 `LIFE_CATEGORIES` / `TODO_CATEGORIES` 兩個陣列即可，不需要改其他地方。
