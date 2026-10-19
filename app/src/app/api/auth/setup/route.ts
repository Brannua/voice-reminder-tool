import { NextRequest, NextResponse } from "next/server"
import { createSession, hashPassword, isInitialized } from "@/lib/auth"
import { setSetting, SETTING_KEYS } from "@/lib/settings"
import { getSupabaseClient } from "@/storage/database/supabase-client"

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as { password?: string }
		const password = typeof body.password === "string" ? body.password : ""
		if (password.length < 4) {
			return NextResponse.json({ error: "密碼長度至少 4 碼" }, { status: 400 })
		}
		if (await isInitialized()) {
			return NextResponse.json({ error: "密碼已設置過，請直接登入" }, { status: 409 })
		}
		await setSetting(SETTING_KEYS.passwordHash, hashPassword(password))

		// 建立內建「我」聯絡人
		const client = getSupabaseClient()
		const { data: existing, error: queryError } = await client
			.from("contacts")
			.select("id")
			.eq("is_self", true)
			.maybeSingle()
		if (queryError) throw new Error(`查詢聯絡人失敗: ${queryError.message}`)
		if (!existing) {
			const { error } = await client
				.from("contacts")
				.insert({ name: "我", email: "", is_self: true })
			if (error) throw new Error(`建立內建聯絡人失敗: ${error.message}`)
		}

		await createSession()
		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "設置失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
