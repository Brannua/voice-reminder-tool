export type ReminderStatus = "pending" | "sent" | "failed"

export interface Reminder {
	id: string
	content: string
	recipient_name: string
	recipient_email: string
	remind_at: string
	status: ReminderStatus
	sent_at: string | null
	created_at: string
}

export interface Contact {
	id: string
	name: string
	email: string
	is_self: boolean
	created_at: string
}

export type ConverseStage = "expect_reminder" | "expect_confirm" | "expect_email"

export interface ConverseDraft {
	content: string
	remind_at: string
	recipient_name: string
	recipient_email: string
	is_self: boolean
}

export interface ConverseResponse {
	heard: string
	speak: string
	audioUri: string | null
	stage: ConverseStage
	draft: ConverseDraft | null
	reminderCreated: boolean
	error?: string
}
