import { EventEmitter } from 'node:events'

export interface AudioGenerationRequest {
  prompt: string
  duration?: number
  params?: Record<string, unknown>
}

export interface AudioGenerationResult {
  filePath: string
  duration: number
}

export interface AudioGenerator {
  generate(request: AudioGenerationRequest): Promise<AudioGenerationResult>
}

interface ComfyUIResponse {
  output?: { file?: string }
  [key: string]: unknown
}

class ComfyUIGenerator extends EventEmitter implements AudioGenerator {
  private apiUrl: string
  private workflowTemplate: Record<string, unknown>

  constructor(apiUrl = 'http://localhost:8188', workflowTemplate: Record<string, unknown> = {}) {
    super()
    this.apiUrl = apiUrl
    this.workflowTemplate = workflowTemplate
  }

  async generate(request: AudioGenerationRequest): Promise<AudioGenerationResult> {
    this.emit('generation-start', request)

    const workflow = {
      ...this.workflowTemplate,
      prompt: request.prompt,
      ...(request.duration ? { duration: request.duration } : {}),
      ...(request.params || {}),
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    try {
      const response = await fetch(`${this.apiUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`ComfyUI API error: ${response.statusText}`)
      }

      const result = await response.json() as ComfyUIResponse
      this.emit('generation-complete', result)

      return {
        filePath: result.output?.file || '',
        duration: request.duration || 0,
      }
    } finally {
      clearTimeout(timeout)
    }
  }
}

export class AudioGenService {
  private generator: AudioGenerator | null = null

  configure(generator: AudioGenerator): void {
    this.generator = generator
  }

  configureComfyUI(apiUrl?: string, workflowTemplate?: Record<string, unknown>): void {
    this.generator = new ComfyUIGenerator(apiUrl, workflowTemplate)
  }

  isAvailable(): boolean {
    return this.generator !== null
  }

  async generate(request: AudioGenerationRequest): Promise<AudioGenerationResult> {
    if (!this.generator) {
      throw new Error('No audio generator configured')
    }
    return this.generator.generate(request)
  }
}

export const audioGenService = new AudioGenService()
