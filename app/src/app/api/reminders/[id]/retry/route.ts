import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/auth"
import { sendReminderEmail, smtpConfigured } from "@/lib/mailer"
import { getSupabaseClient } from "@/storage/database/supabase-client"

type RouteContext = { params: Promise<{ id: string }> }

interface ReminderRow {
	id: string
	content: string
	recipient_name: string
	recipient_email: string
	remind_at: string
	status: string
}

export async function POST(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const { id } = await context.params
		const client = getSupabaseClient()
		const { data, error: findError } = await client
			.from("reminders")
			.select("id, content, recipient_name, recipient_email, remind_at, status")
			.eq("id", id)
			.maybeSingle()
		if (findError) throw new Error(`查詢提醒失敗: ${findError.message}`)
		const reminder = data as ReminderRow | null
		if (!reminder) {
			return NextResponse.json({ error: "提醒不存在" }, { status: 404 })
		}
		if (reminder.status !== "failed") {
			return NextResponse.json({ error: "只有發送失敗的提醒可以重試" }, { status: 400 })
		}
		if (!smtpConfigured()) {
			return NextResponse.json({
				ok: false,
				error: "尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD 環境變數",
			})
		}
		try {
			await sendReminderEmail(
				reminder.recipient_email,
				reminder.recipient_name,
				reminder.content,
				new Date(reminder.remind_at),
			)
		} catch (err) {
			const message = err instanceof Error ? err.message : "郵件發送失敗"
			return NextResponse.json({ ok: false, error: `重試失敗：${message}` })
		}
		const { error } = await client
			.from("reminders")
			.update({ status: "sent", sent_at: new Date().toISOString() })
			.eq("id", id)
		if (error) throw new Error(`更新提醒狀態失敗: ${error.message}`)
		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "重試失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
