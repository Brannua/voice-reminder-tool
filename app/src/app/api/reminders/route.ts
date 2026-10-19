import { NextResponse } from "next/server"
import { isAuthed } from "@/lib/auth"
import { getSupabaseClient } from "@/storage/database/supabase-client"

export async function GET(): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const client = getSupabaseClient()
		const { data, error } = await client
			.from("reminders")
			.select(
				"id, content, recipient_name, recipient_email, remind_at, status, sent_at, created_at",
			)
			.order("created_at", { ascending: false })
			.limit(200)
		if (error) throw new Error(`查詢提醒失敗: ${error.message}`)
		return NextResponse.json({ reminders: data ?? [] })
	} catch (err) {
		const message = err instanceof Error ? err.message : "查詢失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
