import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/auth"
import { getSupabaseClient } from "@/storage/database/supabase-client"

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const { id } = await context.params
		const client = getSupabaseClient()
		const { data: existing, error: findError } = await client
			.from("reminders")
			.select("id, status")
			.eq("id", id)
			.maybeSingle()
		if (findError) throw new Error(`查詢提醒失敗: ${findError.message}`)
		if (!existing) {
			return NextResponse.json({ error: "提醒不存在" }, { status: 404 })
		}
		if (existing.status !== "pending") {
			return NextResponse.json({ error: "只有待發送的提醒可以刪除" }, { status: 400 })
		}
		const { error } = await client.from("reminders").delete().eq("id", id)
		if (error) throw new Error(`刪除提醒失敗: ${error.message}`)
		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "刪除失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
