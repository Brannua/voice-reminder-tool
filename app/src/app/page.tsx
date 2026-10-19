"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { LogOut, Settings, Users } from "lucide-react"
import { AuthGate } from "@/components/auth-gate"
import { ReminderList } from "@/components/reminder-list"
import { VoiceAssistant } from "@/components/voice-assistant"

type AuthState = "loading" | "setup" | "login" | "authed"

const navLinkClass =
	"inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

export default function HomePage() {
	const [authState, setAuthState] = useState<AuthState>("loading")
	const [refreshToken, setRefreshToken] = useState(0)

	const checkAuth = useCallback(async (): Promise<void> => {
		try {
			const res = await fetch("/api/auth/status")
			const data = (await res.json()) as { initialized: boolean; authed: boolean }
			if (!data.initialized) setAuthState("setup")
			else if (!data.authed) setAuthState("login")
			else setAuthState("authed")
		} catch {
			setAuthState("login")
		}
	}, [])

	useEffect(() => {
		void checkAuth()
	}, [checkAuth])

	const handleLogout = async (): Promise<void> => {
		await fetch("/api/auth/logout", { method: "POST" })
		setAuthState("login")
	}

	if (authState === "loading") {
		return (
			<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
				載入中…
			</div>
		)
	}

	if (authState === "setup") {
		return <AuthGate mode="setup" onSuccess={() => setAuthState("authed")} />
	}

	if (authState === "login") {
		return <AuthGate mode="login" onSuccess={() => setAuthState("authed")} />
	}

	return (
		<div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 pb-16">
			<header className="flex items-center justify-between py-6">
				<h1 className="text-lg font-medium tracking-wide">語音提醒</h1>
				<nav className="flex items-center gap-1">
					<Link href="/contacts" className={navLinkClass}>
						<Users className="h-4 w-4" />
						<span className="hidden sm:inline">通訊錄</span>
					</Link>
					<Link href="/settings" className={navLinkClass}>
						<Settings className="h-4 w-4" />
						<span className="hidden sm:inline">設置</span>
					</Link>
					<button type="button" onClick={() => void handleLogout()} className={navLinkClass}>
						<LogOut className="h-4 w-4" />
						<span className="hidden sm:inline">登出</span>
					</button>
				</nav>
			</header>

			<main className="flex flex-1 flex-col">
				<section className="flex flex-col items-center py-8 sm:py-12">
					<VoiceAssistant onReminderCreated={() => setRefreshToken((t) => t + 1)} />
				</section>

				<div className="border-t border-border" />

				<section className="pt-8">
					<h2 className="mb-2 text-sm font-medium tracking-wide text-muted-foreground">
						提醒列表
					</h2>
					<ReminderList refreshToken={refreshToken} />
				</section>
			</main>
		</div>
	)
}
