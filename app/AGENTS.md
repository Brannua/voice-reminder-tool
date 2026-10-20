# 語音提醒小工具 — 項目上下文

個人自用的語音提醒工具：用說話建立提醒，到點通過 Gmail SMTP 寄信。所有界面文字為繁體中文。

## 版本技術棧

- **Framework**: Next.js 16 (App Router, webpack) + React 19 + TypeScript 5
- **UI**: shadcn/ui + Tailwind CSS 4（設計規範見 `DESIGN.md`）
- **AI**: coze-coding-dev-sdk — LLM（`doubao-seed-2-0-mini-260215` 解析）、Audio（ASR/TTS，`s2c1b1f3` 語音）
- **數據庫**: Supabase（service_role 訪問，RLS 已啟用無 policy）
- **郵件**: nodemailer + Gmail SMTP（`GMAIL_USER` / `GMAIL_APP_PASSWORD` 環境變數）

## 目錄結構（關鍵文件）

```
src/
├── instrumentation.ts              # register() → 啟動提醒排程器（僅 nodejs runtime）
├── lib/
│   ├── auth.ts                     # scrypt 密碼雜湊 + HMAC 會話 cookie（vr_session）
│   ├── settings.ts                 # settings 表讀寫（password_hash/self_email/user_name）
│   ├── password-reset.ts           # 忘記密碼：驗證碼簽發/核驗、重置令牌、限流鎖定
│   ├── timezone.ts                 # UTC+8 固定時區：語音/顯示時間格式化
│   ├── mailer.ts                   # nodemailer + SMTP 出口 IP 探測 + 提醒/重置郵件模板
│   ├── scheduler.ts                # 每 60s 掃描到期提醒、7 天清理、runSchedulerTickOnce()
│   ├── voice-parse.ts              # LLM 解析提醒/郵箱提取/確認分類
│   ├── contacts.ts                 # 通訊錄查詢（findContactByName/getSelfContact/upsert）
│   ├── recorder.ts                 # 瀏覽器端 WAV 錄音（AudioContext+ScriptProcessor）
│   └── types.ts                    # ConversationStage / Draft / Contact / Reminder 類型
├── app/
│   ├── page.tsx                    # 主界面（登入閘門 + 麥克風 + 提醒列表）
│   ├── forgot-password/page.tsx    # 忘記密碼向導（輸郵箱→驗證碼→新密碼→完成）
│   ├── contacts/page.tsx           # 通訊錄管理
│   ├── settings/page.tsx           # 設置（我的郵箱/稱呼/改密碼/SMTP 狀態）
│   ├── manifest.ts                 # PWA manifest（圖標 /icon.png，用戶會自行替換）
│   └── api/
│       ├── auth/{status,setup,login,logout}/route.ts
│       ├── auth/reset/{request-code,verify,reset}/route.ts # 忘記密碼三段式 API
│       ├── contacts/route.ts       # GET/POST；contacts/[id]/route.ts PUT/DELETE
│       ├── reminders/route.ts      # GET；reminders/[id]/route.ts DELETE（僅 pending）
│       ├── reminders/[id]/retry/route.ts  # POST 重試（200 + {ok:false,error} 表示業務失敗）
│       ├── settings/route.ts       # GET/PUT（改密碼需驗證當前密碼）
│       └── voice/{greet,converse}/route.ts # TTS 問候 / ASR→LLM→TTS 對話管線
└── storage/database/
    ├── shared/schema.ts            # contacts/reminders/settings/password_reset_codes 表（drizzle）
    └── supabase-client.ts          # service_role 客戶端（勿改）
```

## 核心流程

### 語音對話狀態機（client 驅動，server 無狀態逐輪）

`expect_reminder`（聽提醒）→ LLM 解析出 {content, remind_at, recipient_name} →
稱呼匹配通訊錄：未說稱呼=「我」；名單沒有 → `expect_email`（語音追問郵箱，LLM 從口語提取，自動存入通訊錄）→
`expect_confirm`（TTS 複述「…確認嗎？」）→ 說「確認」建單 /「不對」重來。可連續建立，再點麥克風結束。

### 忘記密碼自助重置（`lib/password-reset.ts`）

登入頁「忘記密碼？」→ `/forgot-password` 四步向導（郵箱→驗證碼→新密碼→完成），對應三個無登入態 API：

1. `POST /api/auth/reset/request-code` `{email?}`：收件人白名單＝settings.self_email 與 GMAIL_USER（規範化去重）；顯式傳入的 email 必須在白名單內。真實寄信成功後才 upsert 記錄。回遮蔽郵箱，不回明文驗證碼。
2. `POST /api/auth/reset/verify` `{email,code}`：核驗通過頒發一次性 resetToken（32B 隨機 hex，10min 有效）。
3. `POST /api/auth/reset/reset` `{email,token,password}`：token 有效才用 `hashPassword` 寫 password_hash，成功後刪除該重置記錄。

安全策略（常量集中在 password-reset.ts）：驗證碼 6 位、10min 有效、一次性（consumed_at）；同一 email 連續錯 5 次鎖定 15min（locked_until）；新碼發送間隔 ≥60s（last_sent_at）。驗證碼與 resetToken 均 scrypt 哈希落庫（code_hash/reset_token_hash 均 varchar(255)），明文僅 requestResetCode 返回、僅服務端可見。表 password_reset_codes 以 email 唯一。

### 定時發送

`instrumentation.ts` 的 `register()` 在服務啟動時調用 `startScheduler()`：每 60s 掃描
`status='pending' AND remind_at <= now()`，發信成功→`sent`（記 sent_at），失敗→`failed`；
`sent` 超過 7 天自動刪除。**注意：改動 instrumentation/scheduler 後需重啟 dev server 才生效（HMR 不重跑 register()）。**

SMTP 連接（`lib/mailer.ts`）：固定 587 + STARTTLS（465 在沙箱被屏蔽）。因沙箱出口對 Gmail 不同 IP 段連通性不穩（部分 A 記錄 TCP 超時），createTransporter 前先用 `dns.resolve4` 取全部 A 記錄並並發 TCP 探測，選最快可達 IP 直連，並以 `tls.servername='smtp.gmail.com'` 保證 SNI/證書校驗；可達 IP 會快取，遇到 ETIMEDOUT/ESOCKET/ECONNRESET 時清空快取重新探測重試一次。

## 開發命令

- 包管理：**僅 pnpm**
- 檢查：`pnpm ts-check` / `pnpm lint`（交付前必跑，走 test_run）
- 數據庫：改 `shared/schema.ts` 後執行 `coze-coding-ai db upgrade`；模型同步 `coze-coding-ai db generate-models`

## 編碼規範

- TypeScript strict 心智：禁隱式 any / as any，supabase 每次調用必查 `error`
- 數據庫字段統一 snake_case；id 用 varchar(36) + gen_random_uuid()
- 時間一律存 timestamptz（UTC 瞬間），展示/語音經 `timezone.ts` 轉 UTC+8
- Hydration：動態值（Date.now/Math.random/typeof window）只在 'use client' + useEffect 中使用
- 密碼永不落日誌；`settings` GET 不得返回 password_hash

## 環境變數

- `GMAIL_USER` / `GMAIL_APP_PASSWORD`：Gmail SMTP 憑據（未設置時到期提醒標記「發送失敗」，可界面一鍵重試）
- `DEPLOY_RUN_PORT`：服務端口（禁止硬編碼）
