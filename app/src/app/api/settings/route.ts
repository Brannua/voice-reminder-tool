import { NextRequest, NextResponse } from "next/server"
import { hashPassword, isAuthed, verifyPassword } from "@/lib/auth"
import { getSetting, setSetting, SETTING_KEYS } from "@/lib/settings"
import { smtpConfigured } from "@/lib/mailer"
import { getSupabaseClient } from "@/storage/database/supabase-client"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function GET(): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const [selfEmail, userName] = await Promise.all([
			getSetting(SETTING_KEYS.selfEmail),
			getSetting(SETTING_KEYS.userName),
		])
		return NextResponse.json({
			self_email: selfEmail ?? "",
			user_name: userName ?? "",
			smtp_configured: smtpConfigured(),
		})
	} catch (err) {
		const message = err instanceof Error ? err.message : "讀取設定失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const body = (await request.json()) as {
			self_email?: string
			user_name?: string
			current_password?: string
			new_password?: string
		}

		if (typeof body.self_email === "string") {
			const email = body.self_email.trim()
			if (email && !EMAIL_RE.test(email)) {
				return NextResponse.json({ error: "電子郵箱格式不正確" }, { status: 400 })
			}
			await setSetting(SETTING_KEYS.selfEmail, email)
			// 同步更新內建「我」聯絡人
			const client = getSupabaseClient()
			const { error } = await client
				.from("contacts")
				.update({ email })
				.eq("is_self", true)
			if (error) throw new Error(`同步「我」的郵箱失敗: ${error.message}`)
		}

		if (typeof body.user_name === "string") {
			await setSetting(SETTING_KEYS.userName, body.user_name.trim())
		}

		if (typeof body.new_password === "string" && body.new_password) {
			if (body.new_password.length < 4) {
				return NextResponse.json({ error: "新密碼長度至少 4 碼" }, { status: 400 })
			}
			const stored = await getSetting(SETTING_KEYS.passwordHash)
			const current = typeof body.current_password === "string" ? body.current_password : ""
			if (!stored || !verifyPassword(current, stored)) {
				return NextResponse.json({ error: "目前密碼不正確" }, { status: 401 })
			}
			await setSetting(SETTING_KEYS.passwordHash, hashPassword(body.new_password))
		}

		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "更新設定失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
