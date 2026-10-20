import { NextRequest, NextResponse } from "next/server"
import { ResetError, verifyResetCode } from "@/lib/password-reset"

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as { email?: string; code?: string }
		const email = typeof body.email === "string" ? body.email : ""
		const code = typeof body.code === "string" ? body.code : ""
		if (!email) {
			return NextResponse.json({ error: "請輸入郵箱" }, { status: 400 })
		}
		if (!/^\d{6}$/.test(code.trim())) {
			return NextResponse.json({ error: "請輸入 6 位數驗證碼" }, { status: 400 })
		}
		const { resetToken } = await verifyResetCode(email, code)
		return NextResponse.json({ ok: true, resetToken })
	} catch (err) {
		if (err instanceof ResetError) {
			return NextResponse.json({ error: err.message }, { status: err.status })
		}
		const message = err instanceof Error ? err.message : "驗證失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
