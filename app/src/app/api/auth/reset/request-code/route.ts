import { NextRequest, NextResponse } from "next/server"
import { ResetError, requestResetCode } from "@/lib/password-reset"

export async function POST(request: NextRequest): Promise<NextResponse> {
	try {
		const body = (await request.json()) as { email?: string }
		const email = typeof body.email === "string" ? body.email : ""
		const result = await requestResetCode(email)
		// 僅回傳已遮蔽的收件地址，明文驗證碼絕不回傳客戶端
		return NextResponse.json({
			ok: true,
			email: maskEmail(result.email),
		})
	} catch (err) {
		if (err instanceof ResetError) {
			return NextResponse.json({ error: err.message }, { status: err.status })
		}
		const message = err instanceof Error ? err.message : "驗證碼發送失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}

function maskEmail(email: string): string {
	const [local, domain] = email.split("@")
	if (!domain) return email
	const head = local.slice(0, Math.min(2, local.length))
	return `${head}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`
}
