# 舉手淘汰遊戲

多人同框的即時淘汰遊戲。用 MediaPipe 看姿勢、用中文語音下口令。玩家舉手報名，再設定全場共用的左右手代名詞，接著跟著口令舉手或放手。姿勢會一回合一回合累積，沒保持住的人淘汰。

優化前後的具體數字與手感差異見 [BEFORE_AFTER.md](BEFORE_AFTER.md)。

## 本地執行

這是靜態網站，不需要建置。

```bash
python3 -m http.server 5500
```

瀏覽器打開 `http://localhost:5500`。攝影機與語音需要 `localhost` 或 HTTPS。

## 測試

規則與語音狀態機由 `node --test` 直接載入 `js/` 裡的模組，不是另抄一份。

```bash
node --test
```

只跑某一支：

```bash
node --test player-registration-guard.test.js
node --test speech-controller.test.js
```

## 檔案

- `index.html`：頁面
- `css/game.css`：版面
- `js/main.js`：遊戲迴圈、攝影機與模型載入
- `js/rules.js`：過關、口令、追蹤、報名等純函式
- `js/speech.js`：單一語音辨識狀態機
- `js/audio.js`：合成音效與背景節奏
- `js/render.js`：骨架
- `js/constants.js`：時間與姿勢索引
- `*.test.js`：對應上面模組的測試（部署時會被略過）

## 部署

Vercel（測試檔已在 `.vercelignore` 排除）：

```bash
vercel --prod --yes
```

GitHub Pages：把網站根目錄指到這個資料夾即可，用相對路徑載入 `css/` 與 `js/`，不需要打包。頁面會從 jsDelivr 載入 MediaPipe，從 Google Storage 載入姿勢模型，所以正式環境仍要能連外網。

## 操作備註

- 畫面是鏡子：你的左手在畫面右側。
- 代名詞只改變口令裡的稱呼，過關只看手腕是否高過肩膀。
- 設定裡可把口令從預設的「混沌」改成「單純」。
- 不要把 `.env` 放進版本庫。
