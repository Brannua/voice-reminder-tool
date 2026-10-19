import { NextRequest, NextResponse } from "next/server"
import { ASRClient, Config, HeaderUtils, TTSClient } from "coze-coding-dev-sdk"
import { isAuthed } from "@/lib/auth"
import { findContactByName, getSelfContact, upsertContactEmail } from "@/lib/contacts"
import { formatSpeechTime } from "@/lib/timezone"
import {
	classifyConfirmation,
	extractEmailFromSpeech,
	isCancelSpeech,
	parseReminderText,
} from "@/lib/voice-parse"
import { getSupabaseClient } from "@/storage/database/supabase-client"

type Stage = "expect_reminder" | "expect_confirm" | "expect_email"

interface Draft {
	content: string
	remind_at: string
	recipient_name: string
	recipient_email: string
	is_self: boolean
}

interface ConverseBody {
	audio?: string
	stage?: Stage
	draft?: Draft | null
}

interface TurnResult {
	heard: string
	speak: string
	stage: Stage
	draft: Draft | null
	reminderCreated: boolean
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

function buildConfirmSpeech(draft: Draft): string {
	const who = draft.is_self ? "你" : draft.recipient_name
	return `好的，我會在${formatSpeechTime(new Date(draft.remind_at))}提醒${who}${draft.content}，確認嗎？`
}

async function handleReminderStage(
	text: string,
	headers: Record<string, string>,
): Promise<TurnResult> {
	const base: TurnResult = {
		heard: text,
		speak: "",
		stage: "expect_reminder",
		draft: null,
		reminderCreated: false,
	}
	const parsed = await parseReminderText(text, headers)
	if (!parsed.valid || !parsed.remindAt) {
		base.speak = "抱歉，我沒有聽懂。請像「明天早上十點提醒我去開會」這樣，告訴我時間和事項。"
		return base
	}
	if (parsed.remindAt.getTime() < Date.now() - 60_000) {
		base.speak = "這個時間好像已經過去了，請告訴我一個未來的時間。"
		return base
	}

	// 解析收件人
	let recipientName = "我"
	let recipientEmail = ""
	let isSelf = false
	if (!parsed.recipientName) {
		isSelf = true
		const self = await getSelfContact()
		if (!self || !self.email) {
			base.speak = "你還沒有填寫自己的郵箱，請先到設置頁填寫，之後我才能把提醒寄給你。"
			return base
		}
		recipientEmail = self.email
	} else {
		const contact = await findContactByName(parsed.recipientName)
		if (!contact || !contact.email) {
			const name = parsed.recipientName
			base.stage = "expect_email"
			base.draft = {
				content: parsed.content,
				remind_at: parsed.remindAt.toISOString(),
				recipient_name: name,
				recipient_email: "",
				is_self: false,
			}
			base.speak = `名單裡還沒有「${name}」的郵箱，請告訴我${name}的電子郵箱地址，或說「取消」。`
			return base
		}
		recipientName = contact.name
		recipientEmail = contact.email
	}

	const draft: Draft = {
		content: parsed.content,
		remind_at: parsed.remindAt.toISOString(),
		recipient_name: recipientName,
		recipient_email: recipientEmail,
		is_self: isSelf,
	}
	base.stage = "expect_confirm"
	base.draft = draft
	base.speak = buildConfirmSpeech(draft)
	return base
}

async function handleEmailStage(
	text: string,
	draft: Draft,
	headers: Record<string, string>,
): Promise<TurnResult> {
	const base: TurnResult = {
		heard: text,
		speak: "",
		stage: "expect_email",
		draft,
		reminderCreated: false,
	}
	if (isCancelSpeech(text)) {
		base.stage = "expect_reminder"
		base.draft = null
		base.speak = "好的，已取消這個提醒。還有什麼我可以幫忙的？"
		return base
	}
	const email = await extractEmailFromSpeech(text, headers)
	if (!email) {
		base.speak = "抱歉，我沒聽懂這個郵箱地址，請再說一次，或說「取消」。"
		return base
	}
	const contact = await upsertContactEmail(draft.recipient_name, email)
	const nextDraft: Draft = {
		...draft,
		recipient_name: contact.name,
		recipient_email: email,
	}
	base.stage = "expect_confirm"
	base.draft = nextDraft
	base.speak = `已記下${contact.name}的郵箱。${buildConfirmSpeech(nextDraft)}`
	return base
}

async function handleConfirmStage(
	text: string,
	draft: Draft,
): Promise<TurnResult> {
	const base: TurnResult = {
		heard: text,
		speak: "",
		stage: "expect_confirm",
		draft,
		reminderCreated: false,
	}
	const verdict = classifyConfirmation(text)
	if (verdict === "deny") {
		base.stage = "expect_reminder"
		base.draft = null
		base.speak = "好的，那我們重新來。請告訴我要提醒的事項。"
		return base
	}
	if (verdict === "unknown") {
		base.speak = "抱歉，請說「確認」建立提醒，或說「不對」重新來。"
		return base
	}

	// 建立提醒
	const remindAt = new Date(draft.remind_at)
	if (!draft.content || Number.isNaN(remindAt.getTime()) || !EMAIL_RE.test(draft.recipient_email)) {
		base.stage = "expect_reminder"
		base.draft = null
		base.speak = "剛才的內容有缺漏，我們重新來一次。請告訴我要提醒的事項。"
		return base
	}
	const client = getSupabaseClient()
	const { error } = await client.from("reminders").insert({
		content: draft.content,
		recipient_name: draft.recipient_name,
		recipient_email: draft.recipient_email,
		remind_at: remindAt.toISOString(),
		status: "pending",
	})
	if (error) throw new Error(`建立提醒失敗: ${error.message}`)

	base.stage = "expect_reminder"
	base.draft = null
	base.reminderCreated = true
	base.speak = "好的，提醒已建立。還有什麼我可以幫忙的？"
	return base
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	const headers = HeaderUtils.extractForwardHeaders(request.headers)
	try {
		const body = (await request.json()) as ConverseBody
		const audio = typeof body.audio === "string" ? body.audio : ""
		const stage: Stage =
			body.stage === "expect_confirm" || body.stage === "expect_email"
				? body.stage
				: "expect_reminder"
		const draft = body.draft ?? null
		if (!audio) {
			return NextResponse.json({ error: "缺少音頻資料" }, { status: 400 })
		}

		// 1. ASR 語音轉文字
		const asr = new ASRClient(new Config(), headers)
		const asrResult = await asr.recognize({ uid: "voice-reminder", base64Data: audio })
		const heard = (asrResult.text ?? "").trim()

		// 2. 依對話階段處理
		let result: TurnResult
		if (!heard) {
			result = {
				heard: "",
				speak: "抱歉，我沒有聽到聲音，請再說一次。",
				stage,
				draft,
				reminderCreated: false,
			}
		} else if (stage === "expect_confirm" && draft) {
			result = await handleConfirmStage(heard, draft)
		} else if (stage === "expect_email" && draft) {
			result = await handleEmailStage(heard, draft, headers)
		} else {
			result = await handleReminderStage(heard, headers)
		}

		// 3. TTS 合成回應語音
		let audioUri: string | null = null
		try {
			const tts = new TTSClient(new Config(), headers)
			const ttsRes = await tts.synthesize({ uid: "voice-reminder", text: result.speak })
			audioUri = ttsRes.audioUri
		} catch (ttsErr) {
			console.error("[converse] TTS 合成失敗:", ttsErr)
		}

		return NextResponse.json({
			heard: result.heard,
			speak: result.speak,
			audioUri,
			stage: result.stage,
			draft: result.draft,
			reminderCreated: result.reminderCreated,
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : "語音處理失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
