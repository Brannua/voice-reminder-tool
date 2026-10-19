"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Pencil, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Contact } from "@/lib/types"

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export default function ContactsPage() {
	const router = useRouter()
	const [authed, setAuthed] = useState<boolean | null>(null)
	const [contacts, setContacts] = useState<Contact[]>([])
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [error, setError] = useState("")
	const [adding, setAdding] = useState(false)
	const [editingId, setEditingId] = useState<string | null>(null)
	const [editName, setEditName] = useState("")
	const [editEmail, setEditEmail] = useState("")
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

	const load = useCallback(async (): Promise<void> => {
		const res = await fetch("/api/contacts")
		if (res.ok) {
			const data = (await res.json()) as { contacts: Contact[] }
			setContacts(data.contacts)
		}
	}, [])

	useEffect(() => {
		void (async () => {
			const res = await fetch("/api/auth/status")
			const data = (await res.json()) as { authed: boolean }
			if (!data.authed) {
				router.replace("/")
				return
			}
			setAuthed(true)
			await load()
		})()
	}, [router, load])

	useEffect(() => {
		if (!confirmDeleteId) return
		const timer = window.setTimeout(() => setConfirmDeleteId(null), 3000)
		return () => window.clearTimeout(timer)
	}, [confirmDeleteId])

	const handleAdd = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
		e.preventDefault()
		setError("")
		if (!name.trim()) {
			setError("請輸入稱呼")
			return
		}
		if (!EMAIL_RE.test(email.trim())) {
			setError("請輸入正確的電子郵箱")
			return
		}
		setAdding(true)
		try {
			const res = await fetch("/api/contacts", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: name.trim(), email: email.trim() }),
			})
			const data = (await res.json()) as { error?: string }
			if (!res.ok) {
				setError(data.error ?? "新增失敗")
				return
			}
			setName("")
			setEmail("")
			await load()
		} finally {
			setAdding(false)
		}
	}

	const startEdit = (contact: Contact): void => {
		setEditingId(contact.id)
		setEditName(contact.name)
		setEditEmail(contact.email)
		setError("")
	}

	const handleSaveEdit = async (contact: Contact): Promise<void> => {
		setError("")
		if (!EMAIL_RE.test(editEmail.trim())) {
			setError("請輸入正確的電子郵箱")
			return
		}
		const payload: { name?: string; email: string } = { email: editEmail.trim() }
		if (!contact.is_self) {
			if (!editName.trim()) {
				setError("請輸入稱呼")
				return
			}
			payload.name = editName.trim()
		}
		const res = await fetch(`/api/contacts/${contact.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		})
		const data = (await res.json()) as { error?: string }
		if (!res.ok) {
			setError(data.error ?? "更新失敗")
			return
		}
		setEditingId(null)
		await load()
	}

	const handleDelete = async (id: string): Promise<void> => {
		if (confirmDeleteId !== id) {
			setConfirmDeleteId(id)
			return
		}
		setConfirmDeleteId(null)
		setError("")
		const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" })
		if (!res.ok) {
			const data = (await res.json()) as { error?: string }
			setError(data.error ?? "刪除失敗")
			return
		}
		await load()
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
				<h1 className="text-lg font-medium tracking-wide">收件人名單</h1>
			</header>

			<form
				onSubmit={handleAdd}
				className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end"
			>
				<div className="space-y-1.5">
					<Label htmlFor="name">稱呼</Label>
					<Input
						id="name"
						placeholder="例如：小明"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="bg-white"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="email">電子郵箱</Label>
					<Input
						id="email"
						type="email"
						placeholder="name@example.com"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="bg-white"
					/>
				</div>
				<Button type="submit" disabled={adding} className="sm:mb-px">
					<Plus className="h-4 w-4" />
					新增
				</Button>
			</form>

			{error && <p className="mb-4 text-sm text-terracotta">{error}</p>}

			<ul className="divide-y divide-border">
				{contacts.map((contact) => (
					<li key={contact.id} className="py-4">
						{editingId === contact.id ? (
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center">
								<Input
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
									disabled={contact.is_self}
									placeholder="稱呼"
									className="bg-white"
								/>
								<Input
									value={editEmail}
									onChange={(e) => setEditEmail(e.target.value)}
									placeholder="電子郵箱"
									className="bg-white"
								/>
								<div className="flex gap-1">
									<button
										type="button"
										onClick={() => void handleSaveEdit(contact)}
										className="inline-flex h-9 items-center gap-1 rounded-md bg-ink px-3 text-xs text-paper transition-colors hover:opacity-90"
									>
										<Check className="h-3.5 w-3.5" />
										儲存
									</button>
									<button
										type="button"
										onClick={() => setEditingId(null)}
										className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-xs text-muted-foreground transition-colors hover:bg-muted"
									>
										<X className="h-3.5 w-3.5" />
										取消
									</button>
								</div>
							</div>
						) : (
							<div className="flex items-center gap-3">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<p className="text-[15px] font-medium text-foreground">
											{contact.name}
										</p>
										{contact.is_self && (
											<span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
												內建
											</span>
										)}
									</div>
									<p className="mt-0.5 truncate text-sm text-muted-foreground">
										{contact.email || "尚未填寫郵箱（請到設置頁填寫）"}
									</p>
								</div>
								<div className="flex shrink-0 gap-1">
									<button
										type="button"
										onClick={() => startEdit(contact)}
										className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										aria-label="編輯"
									>
										<Pencil className="h-4 w-4" />
									</button>
									{!contact.is_self && (
										<button
											type="button"
											onClick={() => void handleDelete(contact.id)}
											className={[
												"inline-flex h-8 items-center justify-center gap-1 rounded-md px-2 text-xs transition-colors",
												confirmDeleteId === contact.id
													? "bg-terracotta text-paper"
													: "text-muted-foreground hover:bg-muted hover:text-foreground",
											].join(" ")}
											aria-label="刪除"
										>
											<Trash2 className="h-4 w-4" />
											{confirmDeleteId === contact.id && "確認刪除"}
										</button>
									)}
								</div>
							</div>
						)}
					</li>
				))}
			</ul>

			{contacts.length === 0 && (
				<p className="py-10 text-center text-sm text-muted-foreground">
					名單還是空的，新增幾位常用聯絡人吧。
				</p>
			)}
		</div>
	)
}
