import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto"
import { cookies } from "next/headers"
import { getSetting, SETTING_KEYS } from "@/lib/settings"

export const SESSION_COOKIE = "vr_session"
const SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 天

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex")
	const hash = scryptSync(password, salt, 64).toString("hex")
	return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(":")
	if (!salt || !hash) return false
	const candidate = scryptSync(password, salt, 64)
	const expected = Buffer.from(hash, "hex")
	if (candidate.length !== expected.length) return false
	return timingSafeEqual(candidate, expected)
}

function expectedToken(passwordHash: string): string {
	return createHmac("sha256", passwordHash)
		.update("voice-reminder-session-v1")
		.digest("hex")
}

export async function isInitialized(): Promise<boolean> {
	const hash = await getSetting(SETTING_KEYS.passwordHash)
	return Boolean(hash)
}

export async function createSession(): Promise<void> {
	const hash = await getSetting(SETTING_KEYS.passwordHash)
	if (!hash) throw new Error("尚未設置密碼")
	const store = await cookies()
	store.set(SESSION_COOKIE, expectedToken(hash), {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.COZE_PROJECT_ENV === "PROD",
		maxAge: SESSION_MAX_AGE,
		path: "/",
	})
}

export async function clearSession(): Promise<void> {
	const store = await cookies()
	store.delete(SESSION_COOKIE)
}

export async function isAuthed(): Promise<boolean> {
	const hash = await getSetting(SETTING_KEYS.passwordHash)
	if (!hash) return false
	const store = await cookies()
	const token = store.get(SESSION_COOKIE)?.value
	if (!token) return false
	const expected = expectedToken(hash)
	const a = Buffer.from(token)
	const b = Buffer.from(expected)
	if (a.length !== b.length) return false
	return timingSafeEqual(a, b)
}
