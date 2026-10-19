import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/auth"
import { getSupabaseClient } from "@/storage/database/supabase-client"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function GET(): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const client = getSupabaseClient()
		const { data, error } = await client
			.from("contacts")
			.select("id, name, email, is_self, created_at")
			.order("is_self", { ascending: false })
			.order("created_at", { ascending: true })
		if (error) throw new Error(`查詢聯絡人失敗: ${error.message}`)
		return NextResponse.json({ contacts: data ?? [] })
	} catch (err) {
		const message = err instanceof Error ? err.message : "查詢失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const body = (await request.json()) as { name?: string; email?: string }
		const name = typeof body.name === "string" ? body.name.trim() : ""
		const email = typeof body.email === "string" ? body.email.trim() : ""
		if (!name) {
			return NextResponse.json({ error: "請填寫稱呼" }, { status: 400 })
		}
		if (!EMAIL_RE.test(email)) {
			return NextResponse.json({ error: "電子郵箱格式不正確" }, { status: 400 })
		}
		const client = getSupabaseClient()
		const { data: dup, error: dupError } = await client
			.from("contacts")
			.select("id")
			.ilike("name", name)
			.limit(1)
		if (dupError) throw new Error(`查詢聯絡人失敗: ${dupError.message}`)
		if (dup && dup.length > 0) {
			return NextResponse.json({ error: "已有相同稱呼的聯絡人" }, { status: 409 })
		}
		const { data, error } = await client
			.from("contacts")
			.insert({ name, email, is_self: false })
			.select()
		if (error) throw new Error(`新增聯絡人失敗: ${error.message}`)
		return NextResponse.json({ contact: data?.[0] ?? null })
	} catch (err) {
		const message = err instanceof Error ? err.message : "新增失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
