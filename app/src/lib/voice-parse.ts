import { Config, LLMClient } from "coze-coding-dev-sdk"
import { nowUtc8Text, parseUtc8DateTime } from "@/lib/timezone"

const PARSE_MODEL = "doubao-seed-2-0-mini-260215"

export interface ParsedReminder {
	valid: boolean
	content: string
	remindAt: Date | null
	recipientName: string | null
}

function extractJson(text: string): Record<string, unknown> | null {
	const match = text.match(/\{[\s\S]*\}/)
	if (!match) return null
	try {
		return JSON.parse(match[0]) as Record<string, unknown>
	} catch {
		return null
	}
}

export async function parseReminderText(
	text: string,
	headers: Record<string, string>,
): Promise<ParsedReminder> {
	const client = new LLMClient(new Config(), headers)
	const prompt = `你是提醒事項解析器。現在時間（UTC+8）是 ${nowUtc8Text()}。
請從用戶的口述中解析提醒事項，只輸出一行 JSON，不要輸出任何其他內容。

輸出格式：
{"valid": true, "content": "要做的事（不含時間與稱呼）", "remind_at": "YYYY-MM-DDTHH:mm:ss+08:00", "recipient_name": 稱呼字串或不帶引號的 null}

規則：
- 「提醒我去繳費」→ 收件人是自己，recipient_name 為 null
- 「提醒小明去取貨」→ recipient_name 為 "小明"
- 相對時間（如「一小時後」「明天早上十點」「下週三」）根據現在時間推算成絕對時間
- content 保留事情本身，例如「去繳信用卡卡費」
- 缺少明確時間或事項內容時輸出 {"valid": false}

用戶口述：${text}`
	const res = await client.invoke([{ role: "user", content: prompt }], {
		model: PARSE_MODEL,
		temperature: 0.1,
	})
	const json = extractJson(res.content)
	if (!json || json.valid !== true) {
		return { valid: false, content: "", remindAt: null, recipientName: null }
	}
	const content = typeof json.content === "string" ? json.content.trim() : ""
	const remindAt =
		typeof json.remind_at === "string" ? parseUtc8DateTime(json.remind_at) : null
	const rawName = typeof json.recipient_name === "string" ? json.recipient_name.trim() : ""
	// 模型有時會把 null 輸出成字串 "null"，需視為無收件人
	const recipientName =
		rawName && rawName.toLowerCase() !== "null" && rawName !== "無" && rawName !== "自己"
			? rawName
			: null
	if (!content || !remindAt) {
		return { valid: false, content: "", remindAt: null, recipientName: null }
	}
	return { valid: true, content, remindAt, recipientName }
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function extractEmailFromSpeech(
	text: string,
	headers: Record<string, string>,
): Promise<string | null> {
	const client = new LLMClient(new Config(), headers)
	const prompt = `用戶用口述說出一個電子郵箱地址，語音辨識結果如下。請還原成合法的 email，只輸出一行 JSON：
{"email": "xxx@yyy.com"} 或 {"valid": false}

常見口述形式：「xiaoming at gmail dot com」「xiaoming 小老鼠 gmail 點 com」「a b c 1 2 3 at outlook dot com」。
只還原郵箱本身，全部小寫，不要加任何說明。

語音辨識結果：${text}`
	const res = await client.invoke([{ role: "user", content: prompt }], {
		model: PARSE_MODEL,
		temperature: 0.1,
	})
	const json = extractJson(res.content)
	const email =
		json && typeof json.email === "string" ? json.email.trim().toLowerCase() : ""
	if (email && EMAIL_RE.test(email)) return email
	return null
}

const DENY_WORDS = ["不對", "不要", "取消", "錯", "重新", "不對勁", "不"]
const CONFIRM_WORDS = ["確認", "對", "好", "是", "可以", "沒問題", "嗯", "ok", "OK", "Yes", "yes"]

export function classifyConfirmation(text: string): "confirm" | "deny" | "unknown" {
	const t = text.replace(/[\s，。！？,.!?]/g, "")
	if (!t) return "unknown"
	for (const w of DENY_WORDS) {
		if (t.includes(w)) return "deny"
	}
	for (const w of CONFIRM_WORDS) {
		if (t.includes(w)) return "confirm"
	}
	return "unknown"
}

export function isCancelSpeech(text: string): boolean {
	const t = text.replace(/[\s，。！？,.!?]/g, "")
	return t.includes("取消") || t.includes("算了") || t.includes("不用了")
}
