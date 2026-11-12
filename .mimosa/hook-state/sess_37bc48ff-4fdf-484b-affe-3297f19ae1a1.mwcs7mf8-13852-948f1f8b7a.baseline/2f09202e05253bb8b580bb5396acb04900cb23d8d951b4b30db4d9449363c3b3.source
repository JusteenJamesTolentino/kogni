import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { generateContentMock, createPartFromBase64Mock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
  createPartFromBase64Mock: vi.fn((data: string, mimeType: string) => ({
    inlineData: { data, mimeType },
  })),
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock }
  },
  createPartFromBase64: createPartFromBase64Mock,
}))

import { generateDeckContinuation, generateDeckFromFile, normalizeGeneratedDeck } from '../../src/lib/gemini'

function generatedCards(prefix = 'Question') {
  return Array.from({ length: 30 }, (_, index) => ({
    question: `${prefix} ${index + 1}?`,
    answer: `Answer ${index + 1}`,
    distractors: [`Distractor ${index + 1}`],
  }))
}

const generatedDeck = {
  title: 'Biology',
  description: 'Cell basics',
  studyGuide: generatedCards().map((card) => `${card.answer} is explained in the topic.`).join('\n'),
  studyGuideCoverage: 'literal-answers-v1' as const,
  cards: generatedCards(),
}

class TestFile {
  readonly size: number
  readonly type: string

  constructor(bits: BlobPart[], _name: string, options?: FilePropertyBag) {
    this.size = typeof bits[0] === 'object' && bits[0] !== null && 'byteLength' in bits[0]
      ? Number(bits[0].byteLength)
      : String(bits[0] ?? '').length
    this.type = options?.type ?? ''
  }
}

class TestFileReader {
  result: string | ArrayBuffer | null = null
  onerror: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null
  onload: ((this: FileReader, event: ProgressEvent<FileReader>) => unknown) | null = null

  readAsDataURL(): void {
    this.result = 'data:application/pdf;base64,c291cmNl'
    this.onload?.call(this as unknown as FileReader, {} as ProgressEvent<FileReader>)
  }
}

function createFile(): File {
  return new File(['source'], 'source.pdf', { type: 'application/pdf' })
}

function apiError(status: number): Error & { status: number } {
  return Object.assign(new Error(`Gemini request failed with status ${status}`), {
    name: 'ApiError',
    status,
  })
}

beforeEach(() => {
  generateContentMock.mockReset()
  createPartFromBase64Mock.mockClear()
  vi.stubGlobal('File', TestFile)
  vi.stubGlobal('FileReader', TestFileReader)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeGeneratedDeck', () => {
  it('normalizes and deduplicates generated cards', () => {
    const result = normalizeGeneratedDeck({
      title: '  Biology  ',
      description: ' Cell basics ',
      studyGuide: ['Energy currency is explained in the topic.', ...generatedCards().slice(1).map((card) => `${card.answer} is explained in the topic.`)].join('\n'),
      cards: generatedCards().map((card, index) => index === 0
        ? {
            question: ' What is ATP? ',
            answer: 'Energy currency',
            distractors: ['Protein', 'protein', 'Energy currency', 'Lipid'],
          }
        : card),
    })

    expect(result.title).toBe('Biology')
    expect(result.studyGuide).toContain('Energy currency is explained in the topic.')
    expect(result.cards[0]).toEqual({
      question: 'What is ATP?',
      answer: 'Energy currency',
      distractors: ['Protein', 'Lipid'],
    })
  })

  it('accepts 30 cards when the guide omits an answer', () => {
    const result = normalizeGeneratedDeck({
      ...generatedDeck,
      studyGuide: generatedDeck.studyGuide.replace('Answer 30 is explained in the topic.', ''),
    })
    expect(result.cards).toHaveLength(30)
    expect(result.studyGuideCoverage).toBeUndefined()
  })

  it('rejects a response without a study guide', () => {
    expect(() => normalizeGeneratedDeck({
      title: 'Biology',
      description: '',
      studyGuide: '   ',
      cards: generatedDeck.cards,
    })).toThrow('Generated deck has no valid study guide')
  })

  it('rejects a response without exactly 30 usable cards', () => {
    expect(() => normalizeGeneratedDeck({ title: 'Empty', description: '', studyGuide: 'Overview', cards: [] })).toThrow(
      'exactly 30 cards',
    )
    expect(() => normalizeGeneratedDeck({
      ...generatedDeck,
      cards: generatedDeck.cards.slice(0, 29),
    })).toThrow('exactly 30 cards')
  })

  it('rejects canonically identical questions', () => {
    const cards = generatedCards()
    cards[1].question = '  QUESTION   1? '
    expect(() => normalizeGeneratedDeck({ ...generatedDeck, cards })).toThrow('duplicate question')
  })
})

describe('generateDeckFromFile', () => {
  it('passes pure Base64 and the exact MIME type to inline data', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await generateDeckFromFile(createFile(), 'api-key', 'configured-model')

    expect(createPartFromBase64Mock).toHaveBeenCalledWith('c291cmNl', 'application/pdf')
    expect(createPartFromBase64Mock.mock.calls[0]?.[0]).not.toContain('data:')
  })

  it('rejects a file larger than the safe inline limit', async () => {
    const oversizedFile = new File([new Uint8Array(14 * 1024 * 1024 + 1)], 'large.pdf', {
      type: 'application/pdf',
    })

    await expect(generateDeckFromFile(oversizedFile, 'api-key', 'configured-model')).rejects.toThrow(
      'The selected file exceeds 14 MB',
    )
    expect(generateContentMock).not.toHaveBeenCalled()
  })

  it('rejects GIF before making an API request', async () => {
    const gif = new File(['source'], 'animation.gif', { type: 'image/gif' })

    await expect(generateDeckFromFile(gif, 'api-key', 'configured-model')).rejects.toThrow(
      'Only PDF, JPEG, PNG, or WebP files are supported',
    )
    expect(generateContentMock).not.toHaveBeenCalled()
  })

  it('uses the configured model for exactly one request', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await expect(generateDeckFromFile(createFile(), 'api-key', 'publisher/custom-model')).resolves.toEqual(generatedDeck)

    expect(generateContentMock).toHaveBeenCalledTimes(1)
    expect(generateContentMock.mock.calls[0]?.[0].model).toBe('publisher/custom-model')
  })

  it('trims the configured model identifier', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await generateDeckFromFile(createFile(), 'api-key', '  gemini-custom.v2  ')

    expect(generateContentMock.mock.calls[0]?.[0].model).toBe('gemini-custom.v2')
  })

  it('rejects an invalid model before making a request', async () => {
    await expect(generateDeckFromFile(createFile(), 'api-key', 'invalid model')).rejects.toThrow(
      'Gemini model ID cannot contain whitespace',
    )

    expect(generateContentMock).not.toHaveBeenCalled()
  })

  it('uses a simplified response schema for the first request', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await generateDeckFromFile(createFile(), 'api-key', 'configured-model')

    const schema = generateContentMock.mock.calls[0]?.[0].config.responseJsonSchema
    expect(schema.properties.cards).toMatchObject({ minItems: 30, maxItems: 30 })
    expect(schema.properties.cards.items.properties.distractors).not.toHaveProperty('maxItems')
    expect(schema.properties.title).not.toHaveProperty('maxLength')
    expect(schema.required).toContain('studyGuide')
    expect(schema.properties.studyGuide).toEqual({ type: 'string' })
  })

  it('retries the same model without a schema after an invalid-argument response', async () => {
    generateContentMock
      .mockRejectedValueOnce(apiError(400))
      .mockResolvedValueOnce({ text: JSON.stringify(generatedDeck) })

    await expect(generateDeckFromFile(createFile(), 'api-key', 'gemini-3.1-flash-lite')).resolves.toEqual(generatedDeck)

    expect(generateContentMock).toHaveBeenCalledTimes(2)
    expect(generateContentMock.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-3.1-flash-lite',
      'gemini-3.1-flash-lite',
    ])
    expect(generateContentMock.mock.calls[0]?.[0].config).toHaveProperty('responseJsonSchema')
    expect(generateContentMock.mock.calls[1]?.[0].config).toEqual({ responseMimeType: 'application/json' })
  })

  it.each([401, 404, 429, 500, 503])('does not use compatibility mode for HTTP %i', async (status) => {
    const error = apiError(status)
    generateContentMock.mockRejectedValue(error)

    await expect(generateDeckFromFile(createFile(), 'api-key', 'configured-model')).rejects.toBe(error)

    expect(generateContentMock).toHaveBeenCalledTimes(1)
  })

  it('returns actionable guidance after two invalid-argument responses', async () => {
    generateContentMock
      .mockRejectedValueOnce(apiError(400))
      .mockRejectedValueOnce(apiError(400))

    await expect(generateDeckFromFile(createFile(), 'api-key', 'configured-model')).rejects.toThrow(
      'The configured model rejected this application/pdf input. Try a smaller PDF, JPEG, PNG, or WebP file, or choose another model in Gemini settings.',
    )

    expect(generateContentMock).toHaveBeenCalledTimes(2)
  })

  it('reports compatibility mode without sensitive data', async () => {
    const progress = vi.fn()
    generateContentMock
      .mockRejectedValueOnce(apiError(400))
      .mockResolvedValueOnce({ text: JSON.stringify(generatedDeck) })

    await generateDeckFromFile(createFile(), 'secret-api-key', 'gemini-3.1-flash-lite', progress)

    const events = progress.mock.calls.map(([event]) => event)
    expect(events.map((event) => event.stage)).toEqual([
      'preparing',
      'requesting',
      'compatibility',
      'received',
      'parsing',
      'validating',
    ])
    expect(events[2]).toMatchObject({ model: 'gemini-3.1-flash-lite' })
    expect(JSON.stringify(events)).not.toContain('secret-api-key')
    expect(JSON.stringify(events)).not.toContain('c291cmNl')
  })

  it('preserves provider errors without retrying another model', async () => {
    const error = apiError(503)
    generateContentMock.mockRejectedValue(error)

    await expect(generateDeckFromFile(createFile(), 'api-key', 'configured-model')).rejects.toBe(error)

    expect(generateContentMock).toHaveBeenCalledTimes(1)
  })

  it('reports progress for the configured model without sensitive data', async () => {
    const progress = vi.fn()
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await generateDeckFromFile(createFile(), 'secret-api-key', 'custom/model-v1', progress)

    const events = progress.mock.calls.map(([event]) => event)
    expect(events.map((event) => event.stage)).toEqual([
      'preparing',
      'requesting',
      'received',
      'parsing',
      'validating',
    ])
    expect(events[1]).toMatchObject({ model: 'custom/model-v1' })
    expect(JSON.stringify(events)).not.toContain('secret-api-key')
    expect(JSON.stringify(events)).not.toContain('c291cmNl')
  })
})

describe('generateDeckContinuation', () => {
  const creator = { uid: 'creator-one' } as never
  const input = {
    topic: 'Cell biology',
    studyGuide: 'Cells transfer energy.',
    priorQuestions: generatedCards('Prior').map((card) => card.question),
  }

  it('uses creator credentials and delimits all prior context as untrusted data', async () => {
    generateContentMock.mockResolvedValue({ text: JSON.stringify(generatedDeck) })

    await expect(generateDeckContinuation(creator, input, 'creator-key', 'creator-model')).resolves.toEqual(generatedDeck)

    const request = generateContentMock.mock.calls[0]?.[0]
    expect(request.model).toBe('creator-model')
    expect(request.contents[0].parts).toHaveLength(1)
    const prompt = request.contents[0].parts[0].text
    expect(prompt).toContain('exactly 30 new cards')
    expect(prompt).toContain('BEGIN_UNTRUSTED_TOPIC')
    expect(prompt).toContain('BEGIN_UNTRUSTED_STUDY_GUIDE')
    expect(prompt).toContain('BEGIN_UNTRUSTED_PRIOR_QUESTIONS')
    expect(prompt).toContain('Do not claim access to or request a source file')
    expect(createPartFromBase64Mock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated calls before contacting Gemini', async () => {
    await expect(generateDeckContinuation(null, input, 'creator-key', 'creator-model')).rejects.toThrow('authenticated creator')
    expect(generateContentMock).not.toHaveBeenCalled()
  })

  it('rejects cross-series exact duplicates after canonicalization', async () => {
    const duplicateDeck = { ...generatedDeck, cards: generatedCards() }
    duplicateDeck.cards[0].question = '  PRIOR   1? '
    generateContentMock.mockResolvedValue({ text: JSON.stringify(duplicateDeck) })

    await expect(generateDeckContinuation(creator, input, 'creator-key', 'creator-model')).rejects.toThrow(
      'repeats a prior question',
    )
  })
})
