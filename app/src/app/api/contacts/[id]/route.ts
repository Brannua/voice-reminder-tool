import { NextRequest, NextResponse } from "next/server"
import { isAuthed } from "@/lib/auth"
import { getSupabaseClient } from "@/storage/database/supabase-client"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, context: RouteContext): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const { id } = await context.params
		const body = (await request.json()) as { name?: string; email?: string }
		const client = getSupabaseClient()
		const { data: existing, error: findError } = await client
			.from("contacts")
			.select("id, name, email, is_self")
			.eq("id", id)
			.maybeSingle()
		if (findError) throw new Error(`查詢聯絡人失敗: ${findError.message}`)
		if (!existing) {
			return NextResponse.json({ error: "聯絡人不存在" }, { status: 404 })
		}

		const updates: { name?: string; email?: string } = {}
		if (typeof body.email === "string") {
			const email = body.email.trim()
			if (!EMAIL_RE.test(email)) {
				return NextResponse.json({ error: "電子郵箱格式不正確" }, { status: 400 })
			}
			updates.email = email
		}
		if (typeof body.name === "string") {
			if (existing.is_self) {
				return NextResponse.json({ error: "內建「我」的稱呼不可修改" }, { status: 400 })
			}
			const name = body.name.trim()
			if (!name) {
				return NextResponse.json({ error: "請填寫稱呼" }, { status: 400 })
			}
			const { data: dup, error: dupError } = await client
				.from("contacts")
				.select("id")
				.ilike("name", name)
				.neq("id", id)
				.limit(1)
			if (dupError) throw new Error(`查詢聯絡人失敗: ${dupError.message}`)
			if (dup && dup.length > 0) {
				return NextResponse.json({ error: "已有相同稱呼的聯絡人" }, { status: 409 })
			}
			updates.name = name
		}
		if (Object.keys(updates).length === 0) {
			return NextResponse.json({ error: "沒有需要更新的欄位" }, { status: 400 })
		}
		const { data, error } = await client
			.from("contacts")
			.update(updates)
			.eq("id", id)
			.select()
		if (error) throw new Error(`更新聯絡人失敗: ${error.message}`)
		return NextResponse.json({ contact: data?.[0] ?? null })
	} catch (err) {
		const message = err instanceof Error ? err.message : "更新失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const { id } = await context.params
		const client = getSupabaseClient()
		const { data: existing, error: findError } = await client
			.from("contacts")
			.select("id, is_self")
			.eq("id", id)
			.maybeSingle()
		if (findError) throw new Error(`查詢聯絡人失敗: ${findError.message}`)
		if (!existing) {
			return NextResponse.json({ error: "聯絡人不存在" }, { status: 404 })
		}
		if (existing.is_self) {
			return NextResponse.json({ error: "內建「我」不可刪除" }, { status: 400 })
		}
		const { error } = await client.from("contacts").delete().eq("id", id)
		if (error) throw new Error(`刪除聯絡人失敗: ${error.message}`)
		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "刪除失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
