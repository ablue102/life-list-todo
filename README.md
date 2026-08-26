# 人生清單 ‧ 待辦事項

純前端網站（HTML + CSS + JS），不需要安裝任何軟體或建置工具，可以直接上傳到 GitHub、用 GitHub Pages 部署，資料庫使用 Firebase Firestore，兩人可以用同一組帳號即時共同編輯同一份清單。

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
- **閒置自動登出**：預設閒置 60 分鐘沒有任何操作就會自動登出，需要重新輸入信箱密碼。想調整這個時間，改 `app.js` 最上面的 `IDLE_TIMEOUT_MINUTES` 這個數字即可（單位是分鐘，改成 `0` 就是關閉這個機制）。

## 關於登入狀態會一直留著這件事

Firebase 預設的登入方式是「記住登入狀態」，也就是說**只要瀏覽器沒有登出、沒有清除瀏覽資料，重新打開網址就會直接進去，不用重新輸入密碼**——這是 Firebase Authentication 的預設行為，不是這個網站特別設定的。

這對日常使用是方便的，但如果是**公用電腦或會被別人借用的裝置**，就有風險：只要那個瀏覽器還留著登入狀態，打開網址的人就能直接看到、修改你們的資料，不需要再輸入密碼。所以：
- 在自己私人的手機／筆電上使用，風險很低，不用特別擔心。
- 如果曾經在公用電腦、朋友的裝置上登入過，用完記得按頁首的「登出」，或至少關閉瀏覽器時選擇清除瀏覽資料。
- 這版加入的「閒置自動登出」（見上方）可以降低風險——就算忘記手動登出，超過設定的時間沒有操作也會自動踢出，下次要用時要重新輸入密碼。

## 登入是怎麼運作的

打開網站會先看到「登入」畫面，用信箱＋密碼登入。網站上**沒有開放自助註冊**——這組帳號要由你自己先在 Firebase 主控台手動建立好（步驟見下方），之後兩人就用同一組信箱密碼登入，會同步看到同一份資料。登入狀態由 Firebase Authentication 處理，關閉瀏覽器再打開通常還是登入狀態，要換人使用時按頁首的「登出」即可。

⚠️ 密碼請設定得複雜一點（不要用生日、手機號碼這種），因為只要有這組信箱密碼就能讀寫你們的資料。

## 把程式碼公開在 GitHub 上安全嗎？

安全，這是 Firebase 官方認可的常見做法。`firebase-config.js` 裡的 `apiKey` 等設定值**不是密碼**，只是告訴瀏覽器要連到哪個 Firebase 專案，本身沒有讀寫資料的權限；真正決定「誰能讀寫」的是 Firestore 的安全性規則（下面「部署前要做的事」那段），而不是把設定值藏起來。你們的登入密碼從頭到尾都只存在 Firebase 主控台的使用者列表裡，沒有寫進任何檔案。

## 進階安全性設定（選用，建議設定）

把 Firestore 規則多加一個條件，直接把你們共用帳號的 UID 寫死在規則裡，這樣就算有陌生人自己註冊了新帳號，規則也會直接擋下（因為他的 UID 永遠對不上你寫死的那組）。

你的 UID 在 Firebase 主控台 → Authentication → Users 的列表裡，信箱旁邊會列出一串英數字，複製它，換掉下面的 `"你的UID"`：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/lifeGoals/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId && userId == "你的UID";
    }
    match /users/{userId}/todos/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == userId && userId == "你的UID";
    }
  }
}
```

貼到 Firestore 的「規則」分頁整段覆蓋即可；之後如果想再增加第二個帳號共用，把 `userId == "你的UID"` 那段改成 `(userId == "帳號A的UID" || userId == "帳號B的UID")` 即可。

## 部署前要做的事

1. 到 [Firebase 主控台](https://console.firebase.google.com/) 建立一個新專案（免費方案即可）。
2. 在專案設定 → 一般 → 我的應用程式，新增一個「網頁應用程式」，把拿到的設定值填入 `firebase-config.js` 的 6 個欄位。
3. 到「Authentication」功能，開啟「電子郵件/密碼」這個登入方式（預設是關閉的，需要手動啟用）。
4. 同樣在「Authentication」的使用者列表裡，手動新增一組使用者（輸入你們要共用的信箱與密碼）——這一步只需要做一次，之後兩人就用這組帳號登入。
5. 建立 Firestore 資料庫（原生模式即可）。資料會存在 `users/{你的帳號UID}/lifeGoals` 與 `users/{你的帳號UID}/todos` 底下，網站第一次寫入時自動建立，不用手動建立。
6. 到 Firestore 的「規則」分頁，貼上以下規則（只有登入本人才能讀寫自己帳號底下的資料）：
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/lifeGoals/{docId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
       match /users/{userId}/todos/{docId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
7. 把整個資料夾（這 7 個檔案）上傳到你的 GitHub repository，開啟 GitHub Pages 即可瀏覽。

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
