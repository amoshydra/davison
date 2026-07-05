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
    const { default: fetch } = await import('node-fetch')

    const workflow = {
      ...this.workflowTemplate,
      prompt: request.prompt,
      ...(request.duration ? { duration: request.duration } : {}),
      ...(request.params || {}),
    }

    const response = await fetch(`${this.apiUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    })

    if (!response.ok) {
      throw new Error(`ComfyUI API error: ${response.statusText}`)
    }

    const result = await response.json()
    this.emit('generation-complete', result)

    return {
      filePath: result.output?.file || '',
      duration: request.duration || 0,
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
