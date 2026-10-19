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
│   ├── timezone.ts                 # UTC+8 固定時區：語音/顯示時間格式化
│   ├── mailer.ts                   # nodemailer 單例 + 提醒郵件模板
│   ├── scheduler.ts                # 每 60s 掃描到期提醒、7 天清理、runSchedulerTickOnce()
│   ├── voice-parse.ts              # LLM 解析提醒/郵箱提取/確認分類
│   ├── contacts.ts                 # 通訊錄查詢（findContactByName/getSelfContact/upsert）
│   ├── recorder.ts                 # 瀏覽器端 WAV 錄音（AudioContext+ScriptProcessor）
│   └── types.ts                    # ConversationStage / Draft / Contact / Reminder 類型
├── app/
│   ├── page.tsx                    # 主界面（登入閘門 + 麥克風 + 提醒列表）
│   ├── contacts/page.tsx           # 通訊錄管理
│   ├── settings/page.tsx           # 設置（我的郵箱/稱呼/改密碼/SMTP 狀態）
│   ├── manifest.ts                 # PWA manifest（圖標 /icon.png，用戶會自行替換）
│   └── api/
│       ├── auth/{status,setup,login,logout}/route.ts
│       ├── contacts/route.ts       # GET/POST；contacts/[id]/route.ts PUT/DELETE
│       ├── reminders/route.ts      # GET；reminders/[id]/route.ts DELETE（僅 pending）
│       ├── reminders/[id]/retry/route.ts  # POST 重試（200 + {ok:false,error} 表示業務失敗）
│       ├── settings/route.ts       # GET/PUT（改密碼需驗證當前密碼）
│       └── voice/{greet,converse}/route.ts # TTS 問候 / ASR→LLM→TTS 對話管線
└── storage/database/
    ├── shared/schema.ts            # contacts/reminders/settings 表（drizzle 模型）
    └── supabase-client.ts          # service_role 客戶端（勿改）
```

## 核心流程

### 語音對話狀態機（client 驅動，server 無狀態逐輪）

`expect_reminder`（聽提醒）→ LLM 解析出 {content, remind_at, recipient_name} →
稱呼匹配通訊錄：未說稱呼=「我」；名單沒有 → `expect_email`（語音追問郵箱，LLM 從口語提取，自動存入通訊錄）→
`expect_confirm`（TTS 複述「…確認嗎？」）→ 說「確認」建單 /「不對」重來。可連續建立，再點麥克風結束。

### 定時發送

`instrumentation.ts` 的 `register()` 在服務啟動時調用 `startScheduler()`：每 60s 掃描
`status='pending' AND remind_at <= now()`，發信成功→`sent`（記 sent_at），失敗→`failed`；
`sent` 超過 7 天自動刪除。**注意：改動 instrumentation/scheduler 後需重啟 dev server 才生效（HMR 不重跑 register()）。**

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
