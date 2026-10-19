import { NextRequest, NextResponse } from "next/server"
import { createSession, isInitialized, verifyPassword } from "@/lib/auth"
import { getSetting, SETTING_KEYS } from "@/lib/settings"

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as { password?: string }
		const password = typeof body.password === "string" ? body.password : ""
		if (!password) {
			return NextResponse.json({ error: "請輸入密碼" }, { status: 400 })
		}
		if (!(await isInitialized())) {
			return NextResponse.json({ error: "尚未設置密碼" }, { status: 400 })
		}
		const stored = await getSetting(SETTING_KEYS.passwordHash)
		if (!stored || !verifyPassword(password, stored)) {
			return NextResponse.json({ error: "密碼錯誤" }, { status: 401 })
		}
		await createSession()
		return NextResponse.json({ ok: true })
	} catch (err) {
		const message = err instanceof Error ? err.message : "登入失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
