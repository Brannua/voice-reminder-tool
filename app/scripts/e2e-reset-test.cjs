/**
 * 忘記密碼端到端測試（dev only，不參與構建/類型檢查）
 * 用法：tsx scripts/e2e-reset-test.cjs <server-pid>
 * - 從服務進程 /proc/<pid>/environ 繼承 GMAIL_* / COZE_SUPABASE_* 環境變數
 * - lib 真實發送驗證碼郵件（可拿到服務端明文 code）
 * - HTTP 走 request-code/verify/reset/login 完整流程
 */
const { readFileSync } = require("node:fs")
const { createRequire } = require("node:module")

const projectRequire = createRequire("/workspace/projects/scripts/")
const { requestResetCode, hashSecret } = projectRequire("../src/lib/password-reset")
const { getSupabaseClient } = projectRequire("../src/storage/database/supabase-client")

const BASE = "http://localhost:5000"

const pid = process.argv[2]
if (!pid) {
	console.error("usage: tsx scripts/e2e-reset-test.cjs <server-pid>")
	process.exit(1)
}

const envRaw = readFileSync(`/proc/${pid}/environ`, "utf8")
const email = envRaw.split("\0").find((kv) => kv.startsWith("GMAIL_USER="))?.split("=")[1]
if (!email) {
	console.error("GMAIL_USER not found in server env")
	process.exit(1)
}
console.log("TEST_TARGET_EMAIL", email)

const NEW_PASSWORD = "e2e-new-pass-2026"
let pass = 0
let fail = 0
function check(name, cond, detail = "") {
	if (cond) {
		pass++
		console.log("PASS", name)
	} else {
		fail++
		console.log("FAIL", name, detail)
	}
}

async function api(path, body) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
	const json = await res.json()
	return { status: res.status, json }
}

async function getRecord(targetEmail) {
	const { data, error } = await getSupabaseClient()
		.from("password_reset_codes")
		.select("*")
		.eq("email", targetEmail)
		.maybeSingle()
	if (error) throw error
	return data
}

;(async () => {
	try {
		// 1. 真實寄信：服務端生成驗證碼並寄出（沙箱 SMTP 出口偶發抖動，最多重試 3 次）
		let code
		let sendLastErr
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				;({ code } = await requestResetCode(email))
				sendLastErr = null
				break
			} catch (e) {
				sendLastErr = e
				console.log(`第 ${attempt} 次發信失敗：${e.message}，10 秒後重試…`)
				await new Promise((r) => setTimeout(r, 10_000))
			}
		}
		if (sendLastErr) throw sendLastErr
		check("code 為 6 位數字", /^\d{6}$/.test(code), code)

		// 2. HTTP 60 秒限流
		const limited = await api("/api/auth/reset/request-code", { email })
		check("60 秒內重複發碼返回 429", limited.status === 429, JSON.stringify(limited.json))

		// 3. 郵箱白名單：非配置郵箱被拒
		const outsider = await api("/api/auth/reset/request-code", {
			email: "stranger-not-configured@example.com",
		})
		check("非配置郵箱被拒絕(400)", outsider.status === 400, JSON.stringify(outsider.json))

		// 4. 錯誤驗證碼 ×5 觸發鎖定
		for (let i = 1; i <= 4; i++) {
			const r = await api("/api/auth/reset/verify", { email, code: "000000" })
			check(`第 ${i} 次錯碼返回 400 且不鎖定`, r.status === 400, JSON.stringify(r.json))
		}
		const fifth = await api("/api/auth/reset/verify", { email, code: "000000" })
		check("第 5 次錯碼返回 429 鎖定", fifth.status === 429, JSON.stringify(fifth.json))

		// 5. 鎖定期內正確碼也被擋
		const lockedAttempt = await api("/api/auth/reset/verify", { email, code })
		check("鎖定期內正確碼也返回 429", lockedAttempt.status === 429, JSON.stringify(lockedAttempt.json))

		// 6. 解除鎖定後，DB 直接寫入一枚新的有效驗證碼（真實寄信已在第 1 步驗證，
		//    此處不重複寄信以避免觸發 60 秒限流）
		const freshCode = "246813"
		const { err: upsertErr } = await getSupabaseClient()
			.from("password_reset_codes")
			.upsert(
				{
					email,
					code_hash: hashSecret(freshCode),
					expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
					consumed_at: null,
					attempts: 0,
					locked_until: null,
					last_sent_at: new Date().toISOString(),
					reset_token_hash: null,
					reset_token_expires_at: null,
				},
				{ onConflict: "email" },
			)
		check("鎖定解除後寫入新有效驗證碼", !upsertErr, String(upsertErr))

		// 7. HTTP 正確驗證碼 -> 頒發 token
		const verified = await api("/api/auth/reset/verify", { email, code: freshCode })
		check(
			"正確碼驗證通過返回 resetToken",
			verified.status === 200 && Boolean(verified.json.resetToken),
			JSON.stringify(verified.json),
		)
		const resetToken = String(verified.json.resetToken ?? "")

		// 8. 驗證碼一次性：再次用同一碼應失敗
		const reused = await api("/api/auth/reset/verify", { email, code: freshCode })
		check("驗證碼一次性（重複使用失敗）", reused.status === 400, JSON.stringify(reused.json))

		// 9. 設置新密碼
		const reset = await api("/api/auth/reset/reset", {
			email,
			token: resetToken,
			password: NEW_PASSWORD,
		})
		check("新密碼設置成功", reset.status === 200 && reset.json.ok === true, JSON.stringify(reset.json))

		// 10. 新密碼可登入，舊密碼不可登入
		const loginNew = await api("/api/auth/login", { password: NEW_PASSWORD })
		check("新密碼可登入", loginNew.status === 200 && loginNew.json.ok === true, JSON.stringify(loginNew.json))
		const loginOld = await api("/api/auth/login", { password: "test1234" })
		check("舊密碼不可登入", loginOld.status === 401, JSON.stringify(loginOld.json))

		// 11. 重置記錄已清理（token 一次性）
		const afterRecord = await getRecord(email)
		check("成功重置後重置記錄已刪除", afterRecord === null, JSON.stringify(afterRecord))

		// 清理：回到首次使用狀態（刪除密碼哈希）
		await getSupabaseClient().from("settings").delete().eq("key", "password_hash")
		const leftRecords = await getRecord(email)
		check("測試數據已清理（無殘留重置記錄）", leftRecords === null, JSON.stringify(leftRecords))
		const { data: settingLeft } = await getSupabaseClient()
			.from("settings")
			.select("key")
			.eq("key", "password_hash")
			.maybeSingle()
		check("密碼哈希已刪除（回到首次使用）", settingLeft === null, JSON.stringify(settingLeft))

		console.log(`\nRESULT pass=${pass} fail=${fail}`)
		process.exit(fail === 0 ? 0 : 1)
	} catch (e) {
		console.error("TEST_FATAL", e)
		process.exit(1)
	}
})()
