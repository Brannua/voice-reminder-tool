"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AudioLines, Loader2, Mic, Square } from "lucide-react"
import { WavRecorder } from "@/lib/recorder"
import type { ConverseDraft, ConverseResponse, ConverseStage } from "@/lib/types"

type Phase = "idle" | "starting" | "speaking" | "listening" | "processing"

const SPEECH_THRESHOLD = 0.02
const SILENCE_LIMIT_MS = 1300
const MAX_UTTERANCE_MS = 20000
const NO_SPEECH_TIMEOUT_MS = 10000

interface VoiceAssistantProps {
	onReminderCreated: () => void
}

export function VoiceAssistant({ onReminderCreated }: VoiceAssistantProps) {
	const [phase, setPhase] = useState<Phase>("idle")
	const [statusText, setStatusText] = useState("點擊麥克風，開始對話")
	const [heardText, setHeardText] = useState("")
	const [speakText, setSpeakText] = useState("")

	const sessionRef = useRef(false)
	const stageRef = useRef<ConverseStage>("expect_reminder")
	const draftRef = useRef<ConverseDraft | null>(null)
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const recorderRef = useRef<WavRecorder | null>(null)
	const emptyTurnsRef = useRef(0)

	useEffect(() => {
		return () => {
			sessionRef.current = false
			recorderRef.current?.cancel()
			audioRef.current?.pause()
		}
	}, [])

	const endSession = useCallback((message?: string): void => {
		sessionRef.current = false
		recorderRef.current?.cancel()
		recorderRef.current = null
		audioRef.current?.pause()
		setPhase("idle")
		setStatusText(message ?? "對話已結束，點擊麥克風重新開始")
	}, [])

	const playReply = useCallback(
		(audioUri: string | null, text: string, after: () => void): void => {
			setSpeakText(text)
			const proceed = (): void => {
				if (sessionRef.current) after()
			}
			if (!audioUri) {
				window.setTimeout(proceed, 1500)
				return
			}
			const audio = audioRef.current ?? new Audio()
			audioRef.current = audio
			setPhase("speaking")
			audio.onended = proceed
			audio.onerror = proceed
			audio.src = audioUri
			void audio.play().catch(proceed)
		},
		[],
	)

	const processUtterance = useCallback(
		async (base64: string): Promise<void> => {
			if (!sessionRef.current) return
			setPhase("processing")
			setStatusText("思考中…")
			try {
				const res = await fetch("/api/voice/converse", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						audio: base64,
						stage: stageRef.current,
						draft: draftRef.current,
					}),
				})
				const data = (await res.json()) as ConverseResponse
				if (!res.ok) throw new Error(data.error ?? "語音處理失敗")
				setHeardText(data.heard)
				if (data.heard) emptyTurnsRef.current = 0
				stageRef.current = data.stage
				draftRef.current = data.draft
				if (data.reminderCreated) onReminderCreated()
				setStatusText("聆聽中，請說出你的提醒…")
				playReply(data.audioUri, data.speak, () => startListeningRef.current())
			} catch (err) {
				const message = err instanceof Error ? err.message : "發生錯誤"
				endSession(`對話中斷：${message}`)
			}
		},
		[endSession, onReminderCreated, playReply],
	)

	const startListening = useCallback((): void => {
		if (!sessionRef.current) return
		setPhase("listening")
		setStatusText("聆聽中，請說出你的提醒…")

		const recorder = new WavRecorder()
		recorderRef.current = recorder
		let speechStarted = false
		let lastSpeechAt = 0
		let finished = false

		const finish = (hasSpeech: boolean): void => {
			if (finished) return
			finished = true
			if (!hasSpeech) {
				recorder.cancel()
				emptyTurnsRef.current += 1
				if (emptyTurnsRef.current >= 2) {
					endSession("很久沒有聽到聲音，我先休息一下，需要時再叫我。")
					return
				}
				setStatusText("沒聽到聲音，仍在聆聽…")
				startListeningRef.current()
				return
			}
			const result = recorder.finish()
			if (!result) {
				startListeningRef.current()
				return
			}
			void processUtteranceRef.current(result.base64)
		}

		recorder.onLevel = (rms: number, elapsed: number): void => {
			if (finished) return
			if (rms >= SPEECH_THRESHOLD) {
				speechStarted = true
				lastSpeechAt = elapsed
			}
			if (speechStarted && elapsed - lastSpeechAt >= SILENCE_LIMIT_MS) {
				finish(true)
			} else if (!speechStarted && elapsed >= NO_SPEECH_TIMEOUT_MS) {
				finish(false)
			} else if (elapsed >= MAX_UTTERANCE_MS) {
				finish(speechStarted)
			}
		}

		recorder
			.start()
			.then(() => {
				if (!sessionRef.current) {
					recorder.cancel()
				}
			})
			.catch(() => {
				endSession("無法使用麥克風，請在瀏覽器中允許麥克風權限。")
			})
	}, [endSession])

	const startListeningRef = useRef(startListening)
	const processUtteranceRef = useRef(processUtterance)
	useEffect(() => {
		startListeningRef.current = startListening
		processUtteranceRef.current = processUtterance
	}, [startListening, processUtterance])

	const startSession = useCallback(async (): Promise<void> => {
		sessionRef.current = true
		emptyTurnsRef.current = 0
		stageRef.current = "expect_reminder"
		draftRef.current = null
		setHeardText("")
		setSpeakText("")
		setPhase("starting")
		setStatusText("正在喚醒…")

		// 在使用者手勢中建立 Audio，避免行動端播放被攔截
		if (!audioRef.current) audioRef.current = new Audio()

		// 先探測麥克風權限，失敗時及早提示
		try {
			const probe = await navigator.mediaDevices.getUserMedia({ audio: true })
			probe.getTracks().forEach((track) => track.stop())
		} catch {
			endSession("無法使用麥克風，請在瀏覽器中允許麥克風權限。")
			return
		}

		try {
			const res = await fetch("/api/voice/greet", { method: "POST" })
			const data = (await res.json()) as {
				text?: string
				audioUri?: string
				error?: string
			}
			if (!res.ok) throw new Error(data.error ?? "啟動失敗")
			playReply(data.audioUri ?? null, data.text ?? "", () =>
				startListeningRef.current(),
			)
		} catch (err) {
			const message = err instanceof Error ? err.message : "啟動失敗"
			endSession(`無法開始對話：${message}`)
		}
	}, [endSession, playReply])

	const handleMicClick = (): void => {
		if (phase === "idle") {
			void startSession()
		} else {
			endSession()
		}
	}

	const isActive = phase !== "idle"
	const isBusy = phase === "starting" || phase === "processing"

	return (
		<div className="flex w-full flex-col items-center">
			<button
				type="button"
				onClick={handleMicClick}
				aria-label={isActive ? "結束對話" : "開始對話"}
				className={[
					"relative flex h-32 w-32 items-center justify-center rounded-full transition-all duration-300 sm:h-36 sm:w-36",
					"focus:outline-none focus-visible:ring-4 focus-visible:ring-ink/20",
					phase === "listening"
						? "bg-terracotta text-paper shadow-lg"
						: "bg-ink text-paper shadow-md hover:scale-[1.03] active:scale-[0.96]",
				].join(" ")}
			>
				{phase === "listening" && (
					<>
						<span className="animate-ripple pointer-events-none absolute inset-0 rounded-full border-2 border-terracotta" />
						<span className="animate-ripple-delay pointer-events-none absolute inset-0 rounded-full border-2 border-terracotta" />
					</>
				)}
				{isBusy ? (
					<Loader2 className="h-10 w-10 animate-spin" strokeWidth={1.5} />
				) : phase === "speaking" ? (
					<AudioLines className="h-10 w-10 animate-pulse" strokeWidth={1.5} />
				) : phase === "listening" ? (
					<Square className="h-8 w-8 fill-current" strokeWidth={1.5} />
				) : (
					<Mic className="h-10 w-10" strokeWidth={1.5} />
				)}
			</button>

			<p className="mt-6 text-sm text-muted-foreground">{statusText}</p>

			{(heardText || speakText) && (
				<div className="mt-6 w-full max-w-md space-y-3 text-sm leading-relaxed">
					{heardText && (
						<div className="flex justify-end">
							<p className="max-w-[85%] rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-paper">
								{heardText}
							</p>
						</div>
					)}
					{speakText && (
						<div className="flex justify-start">
							<p className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-foreground shadow-sm ring-1 ring-border">
								{speakText}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
