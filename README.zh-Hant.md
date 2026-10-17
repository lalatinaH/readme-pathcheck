# readme-pathcheck

喺 Windows 寫 README 冇問題，放上 GitHub 卻出現死圖或失效連結？

呢個小工具會檢查 Markdown 入面嘅本地文件、圖片路徑，同標題連結。**即使電腦唔分檔名大小寫，佢都會逐層核對實際名稱。**

[English](README.md) · [參與開發](CONTRIBUTING.md) · [版本紀錄](CHANGELOG.md)

例如 README 寫咗 `docs/guide.md`，實際檔案叫 `docs/Guide.md`，工具會指出大小寫唔同，並提供正確路徑。

```text
README.md:3 PATH_CASE docs/guide.md#install
  Try: docs/Guide.md#install
README.md:5 MISSING_PATH images/demo.png
README.md:7 MISSING_ANCHOR docs/Guide.md#old-heading
```

## 安裝同試用

需要 Node.js 22 或以上，以及 Git。第一版由 GitHub 提供，暫時未上架 npm。

```sh
git clone https://github.com/lalatinaH/readme-pathcheck.git
cd readme-pathcheck
npm ci --ignore-scripts
npm run demo
```

`npm run demo` 會建立一個臨時範例，示範三個刻意整錯嘅連結。示範完會移除臨時檔案，唔會改你嘅文件。

檢查你自己嘅項目：

```powershell
node bin/readme-pathcheck.js --root "C:\Projects\my-repo"
```

想喺任何資料夾都可以直接用：

```sh
npm install -g . --ignore-scripts
readme-pathcheck --root /path/to/repo
```

安裝會下載依賴套件。**實際檢查全程離線**，唔使登入、唔會上傳文件，亦唔會改動掃描嘅檔案。

## 常用選項

```sh
# 只檢查 README 同 docs，路徑相對於 root
readme-pathcheck README.md docs --root /path/to/repo

# 略過草稿，唔支援萬用字元
readme-pathcheck --exclude docs/drafts

# 輸出 JSON
readme-pathcheck --format json

# 只檢查路徑，略過標題連結
readme-pathcheck --no-anchors
```

結束代碼 `0` 代表支援範圍內冇發現問題，`1` 代表發現連結問題，`2` 代表輸入或讀檔錯誤。報告會列出略過嘅外部連結、HTML、符號連結同未檢查嘅片段數目。

## 第一版嘅範圍

- 支援一般 Markdown 連結、參照連結、圖片、表格內連結、中文檔名同重複標題。
- 程式碼區塊、行內程式碼、註解同 YAML front matter 入面嘅示例唔會當成真連結。
- 會檢查大小寫、遺失檔案、反斜線、Windows 磁碟路徑，同超出項目根目錄嘅路徑。
- **唔會檢查網址係咪仲開到**，亦未支援原始 HTML 圖片／連結、自訂 HTML 標題 ID、MDX、wiki links 同網站產生器路由。
- 行號係所屬 Markdown 區塊嘅開始位置，多行段落可能共用同一行號。
- 唔會讀取 `.gitignore`。預設略過常見依賴、編譯輸出及 archive 資料夾，可以用 `--exclude` 加其他路徑。
- 檔案需為 UTF-8，每個 Markdown 檔上限 2 MiB。唔會跟隨符號連結。

GitHub Actions 範例、JSON 欄位同所有限制請睇 [英文說明](README.md)。

## 參與

遇到誤報或者漏報，可以開 issue，附最細可重現例子、檔案實際名稱、系統同工具版本。唔好上傳私人文件或憑證。

呢個項目啱啱起步，未宣稱有使用者或獲得贊助。初版由 Codex 協助開發，維護帳戶係 `lalatinaH`。採用 [MIT 授權](LICENSE)。
