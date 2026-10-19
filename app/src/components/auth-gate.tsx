"use client"

import { useState } from "react"
import { Mic } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AuthGateProps {
	mode: "setup" | "login"
	onSuccess: () => void
}

export function AuthGate({ mode, onSuccess }: AuthGateProps) {
	const [password, setPassword] = useState("")
	const [confirm, setConfirm] = useState("")
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(false)

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault()
		setError("")
		if (password.length < 4) {
			setError("密碼長度至少 4 個字元")
			return
		}
		if (mode === "setup" && password !== confirm) {
			setError("兩次輸入的密碼不一致")
			return
		}
		setLoading(true)
		try {
			const res = await fetch(`/api/auth/${mode}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password }),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) {
				setError(data.error ?? "操作失敗，請稍後再試")
				return
			}
			onSuccess()
		} catch {
			setError("網路錯誤，請稍後再試")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="flex min-h-dvh flex-col items-center justify-center px-6">
			<div className="w-full max-w-xs">
				<div className="mb-10 flex flex-col items-center text-center">
					<div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-ink text-paper">
						<Mic className="h-6 w-6" strokeWidth={1.75} />
					</div>
					<h1 className="text-xl font-medium tracking-wide">語音提醒小工具</h1>
					<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
						{mode === "setup"
							? "首次使用，請設置一組專用密碼"
							: "請輸入密碼以繼續"}
					</p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="password">密碼</Label>
						<Input
							id="password"
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							autoFocus
							autoComplete={mode === "setup" ? "new-password" : "current-password"}
							className="bg-white"
						/>
					</div>
					{mode === "setup" && (
						<div className="space-y-2">
							<Label htmlFor="confirm">確認密碼</Label>
							<Input
								id="confirm"
								type="password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								autoComplete="new-password"
								className="bg-white"
							/>
						</div>
					)}
					{error && <p className="text-sm text-terracotta">{error}</p>}
					<Button type="submit" className="w-full" disabled={loading}>
						{loading ? "處理中…" : mode === "setup" ? "設置密碼並進入" : "登入"}
					</Button>
				</form>
			</div>
		</div>
	)
}
