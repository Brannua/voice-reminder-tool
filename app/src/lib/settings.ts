import { getSupabaseClient } from "@/storage/database/supabase-client"

export const SETTING_KEYS = {
	passwordHash: "password_hash",
	userName: "user_name",
	selfEmail: "self_email",
} as const

export async function getSetting(key: string): Promise<string | null> {
	const client = getSupabaseClient()
	const { data, error } = await client
		.from("settings")
		.select("value")
		.eq("key", key)
		.maybeSingle()
	if (error) throw new Error(`讀取設定失敗: ${error.message}`)
	return data ? (data.value as string) : null
}

export async function setSetting(key: string, value: string): Promise<void> {
	const client = getSupabaseClient()
	const { error } = await client
		.from("settings")
		.upsert(
			{ key, value, updated_at: new Date().toISOString() },
			{ onConflict: "key" },
		)
	if (error) throw new Error(`寫入設定失敗: ${error.message}`)
}
