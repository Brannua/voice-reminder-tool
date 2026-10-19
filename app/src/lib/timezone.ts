// 時區固定 UTC+8（台灣）
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"] as const

export interface TzParts {
	year: number
	month: number
	day: number
	hour: number
	minute: number
	weekday: number
}

export function toUtc8Parts(date: Date): TzParts {
	const shifted = new Date(date.getTime() + TZ_OFFSET_MS)
	return {
		year: shifted.getUTCFullYear(),
		month: shifted.getUTCMonth() + 1,
		day: shifted.getUTCDate(),
		hour: shifted.getUTCHours(),
		minute: shifted.getUTCMinutes(),
		weekday: shifted.getUTCDay(),
	}
}

function pad2(n: number): string {
	return String(n).padStart(2, "0")
}

function periodText(hour: number): string {
	if (hour < 6) return "凌晨"
	if (hour < 12) return "早上"
	if (hour < 18) return "下午"
	return "晚上"
}

function hour12(hour: number): number {
	const h = hour % 12
	return h === 0 ? 12 : h
}

/** 語音複述用：「1月15日（週三）早上10點30分」 */
export function formatSpeechTime(date: Date): string {
	const p = toUtc8Parts(date)
	const minute = p.minute > 0 ? `${p.minute}分` : ""
	return `${p.month}月${p.day}日（週${WEEKDAYS[p.weekday]}）${periodText(p.hour)}${hour12(p.hour)}點${minute}`
}

/** 列表顯示用：「2025/01/15 週三 10:30」 */
export function formatDisplayTime(input: string | Date): string {
	const date = typeof input === "string" ? new Date(input) : input
	const p = toUtc8Parts(date)
	return `${p.year}/${pad2(p.month)}/${pad2(p.day)} 週${WEEKDAYS[p.weekday]} ${pad2(p.hour)}:${pad2(p.minute)}`
}

/** 提供給 LLM 的現在時間字串 */
export function nowUtc8Text(): string {
	const p = toUtc8Parts(new Date())
	return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)} 週${WEEKDAYS[p.weekday]}`
}

/** 把 LLM 輸出的時間字串解析成 Date；無時區後綴時視為 UTC+8 */
export function parseUtc8DateTime(input: string): Date | null {
	let s = input.trim()
	if (!s) return null
	const hasTz = /([+-]\d{2}:?\d{2}|Z)$/i.test(s)
	if (!hasTz) s = `${s}+08:00`
	const date = new Date(s)
	if (Number.isNaN(date.getTime())) return null
	return date
}
