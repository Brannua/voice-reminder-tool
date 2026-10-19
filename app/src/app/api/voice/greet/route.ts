import { NextRequest, NextResponse } from "next/server"
import { Config, HeaderUtils, TTSClient } from "coze-coding-dev-sdk"
import { isAuthed } from "@/lib/auth"
import { getSetting, SETTING_KEYS } from "@/lib/settings"

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!(await isAuthed())) {
		return NextResponse.json({ error: "未登入" }, { status: 401 })
	}
	try {
		const userName = (await getSetting(SETTING_KEYS.userName)) ?? ""
		const text = userName
			? `嗨，${userName}，有什麼我可以幫忙的？`
			: "嗨，有什麼我可以幫忙的？"
		const headers = HeaderUtils.extractForwardHeaders(request.headers)
		const tts = new TTSClient(new Config(), headers)
		const res = await tts.synthesize({ uid: "voice-reminder", text })
		return NextResponse.json({ text, audioUri: res.audioUri })
	} catch (err) {
		const message = err instanceof Error ? err.message : "語音合成失敗"
		return NextResponse.json({ error: message }, { status: 500 })
	}
}
