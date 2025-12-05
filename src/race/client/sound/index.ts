import { clamp, join } from 'lodash'

const SOUND_BASE_PATH = '/sound'

const SOUND_LIBRARY = {
  crumple: `${SOUND_BASE_PATH}/crumple.mp3`,
  tick: `${SOUND_BASE_PATH}/tick.mp3`,
  success: `${SOUND_BASE_PATH}/success.mp3`,
  error: `${SOUND_BASE_PATH}/error.mp3`,
} as const

type BuiltInSound = keyof typeof SOUND_LIBRARY

export type SoundOptions = {
  delay?: number
  volume?: number
  pitchShift?: number
  skipDedupe?: boolean
}

const MAX_DELAY_SECONDS = 5
const DEDUPE_KEY_SEPARATOR = '::'

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}

const canUseAudio = () =>
  typeof window !== 'undefined' &&
  (typeof window.AudioContext !== 'undefined' ||
    typeof window.webkitAudioContext !== 'undefined')

type ActiveNode = {
  source: AudioBufferSourceNode
  gainNode: GainNode
  dedupeKey?: string
}

class SoundFileEngine {
  private enabled = true

  private volume = 0.5

  private audioContext?: AudioContext

  private activeNodes = new Set<ActiveNode>()

  // Tracks active or scheduled sounds so identical requests can be skipped.
  private dedupeEntries = new Set<string>()

  private bufferCache = new Map<string, Promise<AudioBuffer>>()

  play = (sound: BuiltInSound, options?: SoundOptions) => {
    this.playFile(SOUND_LIBRARY[sound], options)
  }

  private playFile = (src: string, options?: SoundOptions) => {
    if (!this.enabled || !canUseAudio()) {
      return
    }

    void this.schedulePlayback(src, options)
  }

  private async schedulePlayback(src: string, options?: SoundOptions) {
    const context = await this.getAudioContext()
    if (!context) {
      return
    }

    const resolvedVolume = clamp(options?.volume ?? this.volume, 0, 1)
    const delaySeconds = clamp(options?.delay ?? 0, 0, MAX_DELAY_SECONDS)
    const pitchShift = options?.pitchShift ?? 0
    // Convert semitone shifts to playbackRate while keeping the value positive.
    const playbackRate = pitchShift === 0 ? 1 : Math.pow(2, pitchShift / 12)
    const skipDedupe = options?.skipDedupe ?? false
    const dedupeKey = skipDedupe
      ? undefined
      : this.getDedupeKey(src, resolvedVolume, delaySeconds, pitchShift)

    if (dedupeKey && this.dedupeEntries.has(dedupeKey)) {
      return
    }

    if (dedupeKey) {
      this.dedupeEntries.add(dedupeKey)
    }

    try {
      const buffer = await this.getDecodedBuffer(context, src)

      if (dedupeKey) {
        this.releaseDedupeEntry(dedupeKey)
      }

      const gainNode = context.createGain()
      gainNode.gain.value = resolvedVolume

      const source = context.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = playbackRate
      source.connect(gainNode)
      gainNode.connect(context.destination)

      const activeNode: ActiveNode = { source, gainNode, dedupeKey }
      this.activeNodes.add(activeNode)

      source.onended = () => {
        source.disconnect()
        gainNode.disconnect()
        this.activeNodes.delete(activeNode)
        if (dedupeKey) {
          this.releaseDedupeEntry(dedupeKey)
        }
      }

      const startTime = context.currentTime + delaySeconds
      source.start(startTime)
    } catch (error) {
      if (dedupeKey) {
        this.releaseDedupeEntry(dedupeKey)
      }
      console.error('Failed to play sound', error)
    }
  }

  setVolume = (value: number) => {
    this.volume = clamp(value, 0, 1)
  }

  setEnabled = (nextEnabled: boolean) => {
    this.enabled = nextEnabled
    if (!nextEnabled) {
      this.stopAll()
    }
  }

  dispose = () => {
    this.stopAll()
  }

  private stopAll() {
    this.activeNodes.forEach(({ source, gainNode, dedupeKey }) => {
      try {
        source.stop()
      } catch (_error) {
        // Source might already be stopped; ignore.
      }
      source.disconnect()
      gainNode.disconnect()
      if (dedupeKey) {
        this.releaseDedupeEntry(dedupeKey)
      }
    })
    this.activeNodes.clear()
    this.clearDedupeEntries()
    if (this.audioContext) {
      void this.audioContext.close()
      this.audioContext = undefined
    }
    this.bufferCache.clear()
  }

  private getDedupeKey(
    src: string,
    volume: number,
    delaySeconds: number,
    pitchShift: number,
  ) {
    return join([src, volume, delaySeconds, pitchShift], DEDUPE_KEY_SEPARATOR)
  }

  private clearDedupeEntries() {
    this.dedupeEntries.clear()
  }

  private releaseDedupeEntry(key: string) {
    this.dedupeEntries.delete(key)
  }

  private async getAudioContext() {
    if (typeof window === 'undefined') {
      return undefined
    }

    if (!this.audioContext) {
      const AudioContextCtor =
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        window.AudioContext ?? window.webkitAudioContext ?? null
      this.audioContext = new AudioContextCtor()
    }

    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume()
      } catch (_error) {
        // Resume can fail if user gesture not captured; ignore so play attempt can be retried later.
      }
    }

    return this.audioContext
  }

  private getDecodedBuffer(context: AudioContext, src: string) {
    let pending = this.bufferCache.get(src)
    if (!pending) {
      pending = fetch(src)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Failed to load sound: ${response.status}`)
          }
          return response.arrayBuffer()
        })
        .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
        .catch((error) => {
          this.bufferCache.delete(src)
          throw error
        })
      this.bufferCache.set(src, pending)
    }
    return pending
  }
}

export const soundEffects = new SoundFileEngine()
