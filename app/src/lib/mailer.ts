import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { formatDisplayTime } from "@/lib/timezone"

let transporter: Transporter | null = null

export function smtpConfigured(): boolean {
	return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

function getTransporter(): Transporter {
	if (!transporter) {
		transporter = nodemailer.createTransport({
			host: "smtp.gmail.com",
			port: 587,
			secure: false,
			connectionTimeout: 20_000,
			greetingTimeout: 15_000,
			socketTimeout: 30_000,
			auth: {
				user: process.env.GMAIL_USER,
				pass: process.env.GMAIL_APP_PASSWORD,
			},
		})
	}
	return transporter
}

export async function sendReminderEmail(
	to: string,
	recipientName: string,
	content: string,
	remindAt: Date,
): Promise<void> {
	if (!smtpConfigured()) {
		throw new Error("尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD 環境變數")
	}
	const timeText = formatDisplayTime(remindAt)
	const text = [
		`${recipientName} 你好：`,
		"",
		`這是預定於 ${timeText}（UTC+8）送達的提醒：`,
		"",
		content,
		"",
		"— 語音提醒小工具",
	].join("\n")
	const html = `
<div style="font-family:'PingFang TC','Microsoft JhengHei',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1C1B1A">
  <p style="font-size:13px;color:#8A8680;margin:0 0 8px">語音提醒小工具</p>
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">${escapeHtml(content)}</h1>
  <p style="font-size:14px;color:#8A8680;margin:0 0 24px">預定提醒時間：${timeText}（UTC+8）</p>
  <hr style="border:none;border-top:1px solid #E8E5DF;margin:0 0 16px"/>
  <p style="font-size:12px;color:#8A8680;margin:0">收件人：${escapeHtml(recipientName)} &lt;${escapeHtml(to)}&gt;</p>
</div>`
	await getTransporter().sendMail({
		from: `語音提醒小工具 <${process.env.GMAIL_USER}>`,
		to,
		subject: `【提醒】${content}`,
		text,
		html,
	})
}

function escapeHtml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
}
