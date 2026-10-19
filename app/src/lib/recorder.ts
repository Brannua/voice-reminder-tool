/**
 * 瀏覽器端 WAV 錄音器：
 * 使用 AudioContext + ScriptProcessor 收集 PCM，編碼為 16-bit 單聲道 WAV，
 * 輸出 base64 供 ASR 使用。相容 Chrome / Safari / Firefox（含行動端）。
 */

export interface RecordedAudio {
	base64: string
	durationMs: number
	sampleRate: number
}

export class WavRecorder {
	private audioCtx: AudioContext | null = null
	private stream: MediaStream | null = null
	private source: MediaStreamAudioSourceNode | null = null
	private processor: ScriptProcessorNode | null = null
	private chunks: Float32Array[] = []
	private sampleRate = 48000
	private startedAt = 0

	/** 每個音訊幀回調：rms 音量與已錄製毫秒數 */
	onLevel: ((rms: number, elapsedMs: number) => void) | null = null

	async start(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		})
		const Ctor =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
		this.audioCtx = new Ctor()
		this.sampleRate = this.audioCtx.sampleRate
		this.source = this.audioCtx.createMediaStreamSource(this.stream)
		this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1)
		this.chunks = []
		this.startedAt = Date.now()
		this.processor.onaudioprocess = (e: AudioProcessingEvent): void => {
			const input = e.inputBuffer.getChannelData(0)
			this.chunks.push(new Float32Array(input))
			if (this.onLevel) {
				let sum = 0
				for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i]
				this.onLevel(Math.sqrt(sum / input.length), Date.now() - this.startedAt)
			}
		}
		this.source.connect(this.processor)
		this.processor.connect(this.audioCtx.destination)
	}

	/** 結束錄音並返回 WAV base64；無資料時返回 null */
	finish(): RecordedAudio | null {
		const chunks = this.chunks
		const sampleRate = this.sampleRate
		const durationMs = Date.now() - this.startedAt
		this.teardown()
		if (chunks.length === 0) return null
		const wav = encodeWav(chunks, sampleRate)
		return { base64: toBase64(wav), durationMs, sampleRate }
	}

	cancel(): void {
		this.teardown()
	}

	private teardown(): void {
		this.processor?.disconnect()
		this.source?.disconnect()
		this.stream?.getTracks().forEach((track) => track.stop())
		if (this.audioCtx && this.audioCtx.state !== "closed") {
			void this.audioCtx.close()
		}
		this.processor = null
		this.source = null
		this.stream = null
		this.audioCtx = null
		this.chunks = []
	}
}

function encodeWav(chunks: Float32Array[], sampleRate: number): ArrayBuffer {
	const length = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
	const buffer = new ArrayBuffer(44 + length * 2)
	const view = new DataView(buffer)
	const writeString = (offset: number, text: string): void => {
		for (let i = 0; i < text.length; i += 1) {
			view.setUint8(offset + i, text.charCodeAt(i))
		}
	}
	writeString(0, "RIFF")
	view.setUint32(4, 36 + length * 2, true)
	writeString(8, "WAVE")
	writeString(12, "fmt ")
	view.setUint32(16, 16, true) // PCM header size
	view.setUint16(20, 1, true) // PCM format
	view.setUint16(22, 1, true) // mono
	view.setUint32(24, sampleRate, true)
	view.setUint32(28, sampleRate * 2, true) // byte rate
	view.setUint16(32, 2, true) // block align
	view.setUint16(34, 16, true) // bit depth
	writeString(36, "data")
	view.setUint32(40, length * 2, true)
	let offset = 44
	for (const chunk of chunks) {
		for (let i = 0; i < chunk.length; i += 1) {
			const s = Math.max(-1, Math.min(1, chunk[i]))
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
			offset += 2
		}
	}
	return buffer
}

function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ""
	const chunkSize = 0x8000
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
	}
	return btoa(binary)
}
