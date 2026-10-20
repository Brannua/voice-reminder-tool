import { promises as dnsPromises } from "node:dns"
import net from "node:net"
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"
import { formatDisplayTime } from "@/lib/timezone"

const SMTP_HOST = "smtp.gmail.com"
const SMTP_PORT = 587

let transporter: Transporter | null = null
// 已驗證可連通的出口 IP 快取（沙箱對 Gmail 部分 IP 段連通性不穩，需自行探測）
let reachableIp: string | null = null
let resolvingIp: Promise<string> | null = null

export function smtpConfigured(): boolean {
	return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)
}

// 並發 TCP 探測單個 IP，可達則盡快 resolve，否則 reject
function probeIp(ip: string, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = net.connect({ host: ip, port: SMTP_PORT })
		let settled = false
		const done = (fn: () => void) => {
			if (settled) return
			settled = true
			socket.destroy()
			fn()
		}
		socket.setTimeout(timeoutMs)
		socket.once("connect", () => done(() => resolve(ip)))
		socket.once("timeout", () => done(() => reject(new Error(`tcp timeout ${ip}`))))
		socket.once("error", (err) => done(() => reject(err)))
	})
}

// 解析 SMTP 主機的全部 A 記錄，選出一個可連通的 IP（短路返回最快者）
async function resolveReachableSmtpIp(): Promise<string> {
	if (reachableIp) return reachableIp
	if (resolvingIp) return resolvingIp
	resolvingIp = (async () => {
		let addresses: string[]
		try {
			addresses = await dnsPromises.resolve4(SMTP_HOST)
		} catch {
			// DNS 失敗時退回主機名，交由操作系統默認解析處理
			return SMTP_HOST
		}
		// 並發探測，誰先連通就用誰；全數失敗才報錯
		const failures: unknown[] = []
		const ip = await new Promise<string>((resolve, reject) => {
			let pending = addresses.length
			let chosen = false
			if (pending === 0) {
				reject(new Error("smtp 主機無可用 A 記錄"))
				return
			}
			for (const candidate of addresses) {
				probeIp(candidate, 6_000)
					.then((ok) => {
						if (!chosen) {
							chosen = true
							resolve(ok)
						}
					})
					.catch((err) => {
						failures.push(err)
						pending -= 1
						if (pending === 0 && !chosen) {
							reject(new Error("所有 SMTP 出口 IP 均不可達"))
						}
					})
			}
		})
		reachableIp = ip
		return ip
	})()
	try {
		return await resolvingIp
	} finally {
		resolvingIp = null
	}
}

async function createTransporter(): Promise<Transporter> {
	const host = await resolveReachableSmtpIp()
	return nodemailer.createTransport({
		// 連到已驗證可達的具體 IP，避免操作系統只取單條 A 記錄命中壞 IP 段
		host,
		port: SMTP_PORT,
		secure: false,
		name: SMTP_HOST,
		connectionTimeout: 20_000,
		greetingTimeout: 15_000,
		socketTimeout: 30_000,
		// 直連 IP 時必須以主機名作為 SNI / 證書校驗對象
		tls: { servername: SMTP_HOST },
		auth: {
			user: process.env.GMAIL_USER,
			pass: process.env.GMAIL_APP_PASSWORD,
		},
	})
}

// 帶一次重試的發送：若快取 IP 後續失效，清空快取後重新探測再寄
async function withTransporter<T>(run: (tp: Transporter) => Promise<T>): Promise<T> {
	try {
		if (!transporter) transporter = await createTransporter()
		return await run(transporter)
	} catch (err) {
		const code = (err as { code?: string })?.code
		if (code === "ETIMEDOUT" || code === "ESOCKET" || code === "ECONNRESET") {
			transporter = null
			reachableIp = null
			transporter = await createTransporter()
			return run(transporter)
		}
		throw err
	}
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
	await withTransporter((tp) =>
		tp.sendMail({
			from: `語音提醒小工具 <${process.env.GMAIL_USER}>`,
			to,
			subject: `【提醒】${content}`,
			text,
			html,
		}),
	)
}

function escapeHtml(input: string): string {
	return input
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<void> {
	if (!smtpConfigured()) {
		throw new Error("尚未設定 GMAIL_USER / GMAIL_APP_PASSWORD 環境變數")
	}
	const text = [
		"你好：",
		"",
		`你的語音提醒小工具密碼重置驗證碼為：${code}`,
		"",
		"驗證碼 10 分鐘內有效，僅可使用一次。",
		"若非你本人發起的重置請求，請忽略此郵件，你的密碼不會被改變。",
		"",
		"— 語音提醒小工具",
	].join("\n")
	const html = `
<div style="font-family:'PingFang TC','Microsoft JhengHei',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#1C1B1A">
  <p style="font-size:13px;color:#8A8680;margin:0 0 8px">語音提醒小工具</p>
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px">密碼重置驗證碼</h1>
  <p style="font-size:14px;color:#8A8680;margin:0 0 20px">請在 10 分鐘內輸入以下 6 位數驗證碼：</p>
  <div style="font-size:34px;font-weight:600;letter-spacing:10px;font-variant-numeric:tabular-nums;background:#FAF9F6;border:1px solid #E8E5DF;border-radius:12px;padding:20px 0 20px 28px;margin:0 0 20px">${escapeHtml(code)}</div>
  <p style="font-size:13px;color:#8A8680;margin:0 0 24px">驗證碼僅可使用一次。若非本人操作，請忽略此郵件。</p>
  <hr style="border:none;border-top:1px solid #E8E5DF;margin:0 0 16px"/>
  <p style="font-size:12px;color:#8A8680;margin:0">收件人：&lt;${escapeHtml(to)}&gt;</p>
</div>`
	await withTransporter((tp) =>
		tp.sendMail({
			from: `語音提醒小工具 <${process.env.GMAIL_USER}>`,
			to,
			subject: "【語音提醒小工具】密碼重置驗證碼",
			text,
			html,
		}),
	)
}
