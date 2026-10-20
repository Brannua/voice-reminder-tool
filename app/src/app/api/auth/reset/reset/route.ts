import { NextRequest, NextResponse } from "next/server"
import { ResetError, resetPassword } from "@/lib/password-reset"

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as {
			email?: string
			token?: string
			password?: string
		}
		const email = typeof body.email === "string" ? body.email : ""
		const token = typeof body.token === "string" ? body.token : ""
		const password = typeof body.password === "string" ? body.password : ""
		if (!email || !token) {
			return NextResponse.json({ error: "重置會話無效，請重新驗證" }, { status: 400 })
		}
		if (password.length < 4) {
			return NextResponse.json({ error: "密碼長度至少 4 個字元" }, { status: 400 })
		}
		await resetPassword(email, token, password)
		return NextResponse.json({ ok: true })
	} catch (err) {
		if (err instanceof ResetError) {
			return NextResponse.json({ error: err.message }, { status: err.status })
		}
		const message = err instanceof Error ? err.message : "密碼重置失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
