"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function SettingsPage() {
	const router = useRouter()
	const [authed, setAuthed] = useState<boolean | null>(null)

	const [userName, setUserName] = useState("")
	const [selfEmail, setSelfEmail] = useState("")
	const [smtpConfigured, setSmtpConfigured] = useState(false)
	const [profileMsg, setProfileMsg] = useState("")
	const [profileError, setProfileError] = useState("")
	const [savingProfile, setSavingProfile] = useState(false)

	const [currentPassword, setCurrentPassword] = useState("")
	const [newPassword, setNewPassword] = useState("")
	const [confirmPassword, setConfirmPassword] = useState("")
	const [pwdMsg, setPwdMsg] = useState("")
	const [pwdError, setPwdError] = useState("")
	const [savingPwd, setSavingPwd] = useState(false)

	useEffect(() => {
		void (async () => {
			const res = await fetch("/api/auth/status")
			const data = (await res.json()) as { authed: boolean }
			if (!data.authed) {
				router.replace("/")
				return
			}
			setAuthed(true)
			const settingsRes = await fetch("/api/settings")
			if (settingsRes.ok) {
				const settings = (await settingsRes.json()) as {
					user_name: string
					self_email: string
					smtp_configured: boolean
				}
				setUserName(settings.user_name)
				setSelfEmail(settings.self_email)
				setSmtpConfigured(settings.smtp_configured)
			}
		})()
	}, [router])

	const handleSaveProfile = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault()
		setProfileMsg("")
		setProfileError("")
		if (selfEmail.trim() && !EMAIL_RE.test(selfEmail.trim())) {
			setProfileError("請輸入正確的電子郵箱")
			return
		}
		setSavingProfile(true)
		try {
			const res = await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					user_name: userName.trim(),
					self_email: selfEmail.trim(),
				}),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) {
				setProfileError(data.error ?? "儲存失敗")
				return
			}
			setProfileMsg("已儲存")
		} finally {
			setSavingProfile(false)
		}
	}

	const handleChangePassword = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault()
		setPwdMsg("")
		setPwdError("")
		if (newPassword.length < 4) {
			setPwdError("新密碼長度至少 4 個字元")
			return
		}
		if (newPassword !== confirmPassword) {
			setPwdError("兩次輸入的新密碼不一致")
			return
		}
		setSavingPwd(true)
		try {
			const res = await fetch("/api/settings", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					current_password: currentPassword,
					new_password: newPassword,
				}),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) {
				setPwdError(data.error ?? "更新失敗")
				return
			}
			setPwdMsg("密碼已更新")
			setCurrentPassword("")
			setNewPassword("")
			setConfirmPassword("")
		} finally {
			setSavingPwd(false)
		}
	}

	if (authed === null) {
		return (
			<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
				載入中…
			</div>
		)
	}

	return (
		<div className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16">
			<header className="flex items-center gap-3 py-6">
				<Link
					href="/"
					className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="返回首頁"
				>
					<ArrowLeft className="h-4 w-4" />
				</Link>
				<h1 className="text-lg font-medium tracking-wide">設置</h1>
			</header>

			<div className="space-y-10">
				<section>
					<h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
						個人資料
					</h2>
					<form onSubmit={handleSaveProfile} className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="userName">我的稱呼</Label>
							<Input
								id="userName"
								placeholder="例如：lpj（語音問候時使用）"
								value={userName}
								onChange={(e) => setUserName(e.target.value)}
								className="bg-white"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="selfEmail">我的郵箱（收件人「我」）</Label>
							<Input
								id="selfEmail"
								type="email"
								placeholder="me@example.com"
								value={selfEmail}
								onChange={(e) => setSelfEmail(e.target.value)}
								className="bg-white"
							/>
							<p className="text-xs leading-relaxed text-muted-foreground">
								語音建立提醒時，沒有指定收件人的提醒會寄到這個郵箱。
							</p>
						</div>
						{profileError && <p className="text-sm text-terracotta">{profileError}</p>}
						{profileMsg && (
							<p className="inline-flex items-center gap-1 text-sm text-sage">
								<Check className="h-4 w-4" />
								{profileMsg}
							</p>
						)}
						<Button type="submit" disabled={savingProfile}>
							{savingProfile ? "儲存中…" : "儲存"}
						</Button>
					</form>
				</section>

				<div className="border-t border-border" />

				<section>
					<h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground">
						修改密碼
					</h2>
					<form onSubmit={handleChangePassword} className="space-y-4">
						<div className="space-y-1.5">
							<Label htmlFor="currentPassword">目前密碼</Label>
							<Input
								id="currentPassword"
								type="password"
								value={currentPassword}
								onChange={(e) => setCurrentPassword(e.target.value)}
								autoComplete="current-password"
								className="bg-white"
							/>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<div className="space-y-1.5">
								<Label htmlFor="newPassword">新密碼</Label>
								<Input
									id="newPassword"
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									autoComplete="new-password"
									className="bg-white"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="confirmPassword">確認新密碼</Label>
								<Input
									id="confirmPassword"
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									autoComplete="new-password"
									className="bg-white"
								/>
							</div>
						</div>
						{pwdError && <p className="text-sm text-terracotta">{pwdError}</p>}
						{pwdMsg && (
							<p className="inline-flex items-center gap-1 text-sm text-sage">
								<Check className="h-4 w-4" />
								{pwdMsg}
							</p>
						)}
						<Button type="submit" disabled={savingPwd}>
							{savingPwd ? "更新中…" : "更新密碼"}
						</Button>
					</form>
				</section>

				<div className="border-t border-border" />

				<section>
					<h2 className="mb-2 text-sm font-medium tracking-wide text-muted-foreground">
						郵件發送服務
					</h2>
					<p className="text-sm leading-relaxed text-muted-foreground">
						{smtpConfigured
							? "Gmail SMTP 已設定，提醒郵件會自動發送。"
							: "尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD 環境變量，提醒郵件將無法發送。"}
					</p>
				</section>
			</div>
		</div>
	)
}
