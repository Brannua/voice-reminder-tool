"use client"

import { useCallback, useEffect, useState } from "react"
import { Clock, MailCheck, RotateCw, Trash2, TriangleAlert, User } from "lucide-react"
import { formatDisplayTime } from "@/lib/timezone"
import type { Reminder } from "@/lib/types"

interface ReminderListProps {
	refreshToken: number
}

export function ReminderList({ refreshToken }: ReminderListProps) {
	const [reminders, setReminders] = useState<Reminder[]>([])
	const [loading, setLoading] = useState(true)
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
	const [retryingId, setRetryingId] = useState<string | null>(null)
	const [actionError, setActionError] = useState("")

	const load = useCallback(async (): Promise<void> => {
		try {
			const res = await fetch("/api/reminders")
			if (res.ok) {
				const data = (await res.json()) as { reminders: Reminder[] }
				setReminders(data.reminders)
			}
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		void load()
	}, [load, refreshToken])

	useEffect(() => {
		const timer = window.setInterval(() => void load(), 30_000)
		return () => window.clearInterval(timer)
	}, [load])

	useEffect(() => {
		if (!confirmDeleteId) return
		const timer = window.setTimeout(() => setConfirmDeleteId(null), 3000)
		return () => window.clearTimeout(timer)
	}, [confirmDeleteId])

	const handleDelete = async (id: string): Promise<void> => {
		if (confirmDeleteId !== id) {
			setConfirmDeleteId(id)
			return
		}
		setConfirmDeleteId(null)
		setActionError("")
		const res = await fetch(`/api/reminders/${id}`, { method: "DELETE" })
		if (!res.ok) {
			const data = (await res.json()) as { error?: string }
			setActionError(data.error ?? "刪除失敗")
			return
		}
		await load()
	}

	const handleRetry = async (id: string): Promise<void> => {
		setRetryingId(id)
		setActionError("")
		try {
			const res = await fetch(`/api/reminders/${id}/retry`, { method: "POST" })
			const data = (await res.json()) as { ok?: boolean; error?: string }
			if (!res.ok || data.ok === false) {
				setActionError(data.error ?? "重試失敗")
				return
			}
			await load()
		} finally {
			setRetryingId(null)
		}
	}

	const sorted = [...reminders].sort((a, b) => {
		const rank = (r: Reminder): number =>
			r.status === "pending" ? 0 : r.status === "failed" ? 1 : 2
		if (rank(a) !== rank(b)) return rank(a) - rank(b)
		if (a.status === "pending") {
			return new Date(a.remind_at).getTime() - new Date(b.remind_at).getTime()
		}
		const ta = new Date(a.sent_at ?? a.created_at).getTime()
		const tb = new Date(b.sent_at ?? b.created_at).getTime()
		return tb - ta
	})

	if (loading) {
		return <p className="py-10 text-center text-sm text-muted-foreground">載入中…</p>
	}

	if (sorted.length === 0) {
		return (
			<div className="py-12 text-center">
				<p className="text-sm text-muted-foreground">
					還沒有提醒。點擊上方麥克風，用說的建立第一個提醒吧。
				</p>
			</div>
		)
	}

	return (
		<div>
			{actionError && (
				<p className="mb-3 text-sm text-terracotta">{actionError}</p>
			)}
			<ul className="divide-y divide-border">
				{sorted.map((reminder) => (
					<li key={reminder.id} className="flex items-start gap-3 py-4">
						<div className="min-w-0 flex-1">
							<p className="break-words text-[15px] leading-relaxed text-foreground">
								{reminder.content}
							</p>
							<div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
								<span className="inline-flex items-center gap-1">
									<User className="h-3.5 w-3.5" />
									{reminder.recipient_name}
								</span>
								{reminder.status === "pending" && (
									<span className="inline-flex items-center gap-1">
										<Clock className="h-3.5 w-3.5" />
										預定 {formatDisplayTime(reminder.remind_at)}
									</span>
								)}
								{reminder.status === "sent" && reminder.sent_at && (
									<span className="inline-flex items-center gap-1 text-sage">
										<MailCheck className="h-3.5 w-3.5" />
										已送出 {formatDisplayTime(reminder.sent_at)}
									</span>
								)}
								{reminder.status === "failed" && (
									<span className="inline-flex items-center gap-1 text-terracotta">
										<TriangleAlert className="h-3.5 w-3.5" />
										發送失敗
									</span>
								)}
							</div>
						</div>
						<div className="flex shrink-0 items-center gap-1">
							{reminder.status === "failed" && (
								<button
									type="button"
									onClick={() => void handleRetry(reminder.id)}
									disabled={retryingId === reminder.id}
									className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
								>
									<RotateCw
										className={`h-3.5 w-3.5 ${retryingId === reminder.id ? "animate-spin" : ""}`}
									/>
									重試
								</button>
							)}
							{reminder.status === "pending" && (
								<button
									type="button"
									onClick={() => void handleDelete(reminder.id)}
									className={[
										"inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs transition-colors",
										confirmDeleteId === reminder.id
											? "bg-terracotta text-paper"
											: "text-muted-foreground hover:bg-muted hover:text-foreground",
									].join(" ")}
								>
									<Trash2 className="h-3.5 w-3.5" />
									{confirmDeleteId === reminder.id ? "確認刪除" : "刪除"}
								</button>
							)}
						</div>
					</li>
				))}
			</ul>
		</div>
	)
}
