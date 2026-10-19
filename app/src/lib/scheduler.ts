import { getSupabaseClient } from "@/storage/database/supabase-client"
import { sendReminderEmail, smtpConfigured } from "@/lib/mailer"

interface ReminderRow {
	id: string
	content: string
	recipient_name: string
	recipient_email: string
	remind_at: string
	status: string
}

const globalState = globalThis as unknown as {
	__vrSchedulerStarted?: boolean
	__vrSchedulerRunning?: boolean
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function startScheduler(): void {
	if (globalState.__vrSchedulerStarted) return
	globalState.__vrSchedulerStarted = true
	console.log("[scheduler] 提醒排程器已啟動（每 60 秒掃描一次）")
	const timer = setInterval(() => {
		void tick()
	}, 60_000)
	timer.unref?.()
	void tick()
}

/** 立即執行一次掃描（用於運維驗證） */
export async function runSchedulerTickOnce(): Promise<void> {
	await tick()
}

async function tick(): Promise<void> {
	if (globalState.__vrSchedulerRunning) return
	globalState.__vrSchedulerRunning = true
	try {
		await sendDueReminders()
		await cleanupOldReminders()
	} catch (err) {
		console.error("[scheduler] 排程執行失敗:", err)
	} finally {
		globalState.__vrSchedulerRunning = false
	}
}

async function sendDueReminders(): Promise<void> {
	const client = getSupabaseClient()
	const now = new Date().toISOString()
	const { data, error } = await client
		.from("reminders")
		.select("id, content, recipient_name, recipient_email, remind_at, status")
		.eq("status", "pending")
		.lte("remind_at", now)
		.order("remind_at", { ascending: true })
		.limit(50)
	if (error) throw new Error(`掃描到期提醒失敗: ${error.message}`)
	const due = (data ?? []) as ReminderRow[]
	if (due.length === 0) return
	if (!smtpConfigured()) {
		console.warn("[scheduler] 偵測到到期提醒，但未設定 GMAIL_USER / GMAIL_APP_PASSWORD，標記為發送失敗")
	}
	for (const reminder of due) {
		await processOne(client, reminder)
	}
}

async function processOne(
	client: ReturnType<typeof getSupabaseClient>,
	reminder: ReminderRow,
): Promise<void> {
	try {
		await sendReminderEmail(
			reminder.recipient_email,
			reminder.recipient_name,
			reminder.content,
			new Date(reminder.remind_at),
		)
		const { error } = await client
			.from("reminders")
			.update({ status: "sent", sent_at: new Date().toISOString() })
			.eq("id", reminder.id)
		if (error) throw new Error(`更新提醒狀態失敗: ${error.message}`)
		console.log(`[scheduler] 提醒 ${reminder.id} 已送出`)
	} catch (err) {
		console.error(`[scheduler] 提醒 ${reminder.id} 發送失敗:`, err)
		const { error } = await client
			.from("reminders")
			.update({ status: "failed" })
			.eq("id", reminder.id)
		if (error) console.error(`[scheduler] 標記失敗狀態時出錯: ${error.message}`)
	}
}

async function cleanupOldReminders(): Promise<void> {
	const client = getSupabaseClient()
	const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString()
	const { error } = await client
		.from("reminders")
		.delete()
		.eq("status", "sent")
		.lt("sent_at", cutoff)
	if (error) throw new Error(`清理歷史提醒失敗: ${error.message}`)
}
