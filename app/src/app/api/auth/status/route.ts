import { NextResponse } from "next/server"
import { isAuthed, isInitialized } from "@/lib/auth"

export async function GET(): Promise<NextResponse> {
	try {
		const [initialized, authed] = await Promise.all([isInitialized(), isAuthed()])
		return NextResponse.json({ initialized, authed })
	} catch (err) {
		const message = err instanceof Error ? err.message : "狀態查詢失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
