import { getSupabaseClient } from "@/storage/database/supabase-client"

export interface ContactRow {
	id: string
	name: string
	email: string
	is_self: boolean
}

export async function findContactByName(name: string): Promise<ContactRow | null> {
	const client = getSupabaseClient()
	const { data, error } = await client
		.from("contacts")
		.select("id, name, email, is_self")
		.ilike("name", name)
		.limit(1)
	if (error) throw new Error(`查詢聯絡人失敗: ${error.message}`)
	const rows = (data ?? []) as ContactRow[]
	return rows[0] ?? null
}

export async function getSelfContact(): Promise<ContactRow | null> {
	const client = getSupabaseClient()
	const { data, error } = await client
		.from("contacts")
		.select("id, name, email, is_self")
		.eq("is_self", true)
		.maybeSingle()
	if (error) throw new Error(`查詢聯絡人失敗: ${error.message}`)
	return (data as ContactRow | null) ?? null
}

/** 語音流程中補錄聯絡人郵箱：已存在同名則更新，否則新建 */
export async function upsertContactEmail(name: string, email: string): Promise<ContactRow> {
	const existing = await findContactByName(name)
	const client = getSupabaseClient()
	if (existing) {
		const { data, error } = await client
			.from("contacts")
			.update({ email })
			.eq("id", existing.id)
			.select()
		if (error) throw new Error(`更新聯絡人失敗: ${error.message}`)
		const rows = (data ?? []) as ContactRow[]
		return rows[0] ?? { ...existing, email }
	}
	const { data, error } = await client
		.from("contacts")
		.insert({ name, email, is_self: false })
		.select()
	if (error) throw new Error(`新增聯絡人失敗: ${error.message}`)
	const rows = (data ?? []) as ContactRow[]
	if (!rows[0]) throw new Error("新增聯絡人失敗：未返回資料")
	return rows[0]
}
