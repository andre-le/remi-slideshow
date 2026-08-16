import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from '@google/genai';
import { analyzeImage, urlToBase64, ImageInfo } from './imageAnalyzerAgent';
import { generateSystemPrompt } from './liveAgent';
import { EvalQuestion, QuestionEvalResult, VoiceEvalJudge } from './evalJudgeAgent';

/**
 * Progress and event callbacks for the evaluation runner.
 */
export interface EvalRunnerCallbacks {
  onStatusUpdate: (status: string) => void;
  onQuestionStart: (question: EvalQuestion, index: number, total: number) => void;
  onTranscriptChunk: (chunk: string) => void;
  onQuestionComplete: (result: QuestionEvalResult) => void;
}

/**
 * Aggregated summary statistics across an evaluation run.
 */
export interface EvalRunSummary {
  totalQuestions: number;
  passedCount: number;
  passRatePercent: number;
  avgFactualityScore: number;
  hallucinationCount: number;
  avgLatencyMs: number;
}

/**
 * VoiceEvalRunner
 *
 * Orchestrates the end-to-end evaluation lifecycle:
 * 1. Loads context and AI-analyzes multimodal images.
 * 2. Assembles system instructions and boots Gemini Live session.
 * 3. Dispatches benchmark questions sequentially and measures response latency.
 * 4. Invokes the VoiceEvalJudge (LLM-as-a-Judge) for automated scoring.
 */
export class VoiceEvalRunner {
  private client: GoogleGenAI;
  private judge: VoiceEvalJudge;
  private session: Session | null = null;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.judge = new VoiceEvalJudge(this.client, 'gemini-3.7-flash');
  }

  /**
   * Runs the complete evaluation suite against the provided dataset.
   */
  async run(callbacks: EvalRunnerCallbacks): Promise<QuestionEvalResult[]> {
    const results: QuestionEvalResult[] = [];

    try {
      callbacks.onStatusUpdate('Loading context and dataset...');
      const contextResponse = await fetch('/eval_input/context.json');
      if (!contextResponse.ok) {
        throw new Error(`Failed to load /eval_input/context.json: ${contextResponse.statusText}`);
      }

      const contextData = await contextResponse.json();
      const biography: string = contextData.biography || '';
      const photos: { fileName: string; context: string }[] = contextData.photos || [];
      const evalQuestions: EvalQuestion[] = contextData.evalQuestions || [];

      if (evalQuestions.length === 0) {
        throw new Error('No evaluation questions found in context.json');
      }

      callbacks.onStatusUpdate(`Analyzing ${photos.length} evaluation images...`);
      const enrichedPhotos: ImageInfo[] = await Promise.all(
        photos.map(async (p) => {
          try {
            const { base64, mimeType } = await urlToBase64(`/eval_input/${p.fileName}`);
            const aiContext = await analyzeImage(this.client, mimeType, base64);
            return {
              fileName: p.fileName,
              context: p.context,
              aiContext,
              mimeType,
              base64,
              url: `/eval_input/${p.fileName}`,
            };
          } catch (err) {
            console.error(`Failed to analyze image ${p.fileName}:`, err);
            return {
              fileName: p.fileName,
              context: p.context,
              aiContext: 'Photo analysis unavailable.',
              mimeType: 'image/jpeg',
              base64: '',
              url: `/eval_input/${p.fileName}`,
            };
          }
        })
      );

      const formattedPhotoContexts = enrichedPhotos
        .map((info) => `Image "${info.fileName}": User context: ${info.context} | AI vision: ${info.aiContext}`)
        .join('\n');

      const systemInstruction =
        generateSystemPrompt(enrichedPhotos, biography) || 'You are a helpful memory companion.';

      callbacks.onStatusUpdate('Connecting to Gemini Live API session...');
      let currentTranscription = '';
      let turnResolver: ((transcription: string) => void) | null = null;

      this.session = await this.client.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Eval Gemini Live session opened.');
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent as any;
            if (!serverContent) return;

            if (serverContent.outputTranscription?.text) {
              const textChunk = serverContent.outputTranscription.text;
              currentTranscription += textChunk;
              callbacks.onTranscriptChunk(textChunk);
            }

            if (serverContent.turnComplete) {
              if (turnResolver) {
                turnResolver(currentTranscription.trim());
                turnResolver = null;
              }
              currentTranscription = '';
            }
          },
          onerror: (err) => {
            console.error('Eval Live Session error:', err);
            callbacks.onStatusUpdate(`Session error: ${err}`);
          },
          onclose: () => {
            console.log('Eval Live session closed.');
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          outputAudioTranscription: {},
        },
      });

      // Sequential Execution across all benchmark questions
      for (let i = 0; i < evalQuestions.length; i++) {
        const q = evalQuestions[i];
        callbacks.onQuestionStart(q, i, evalQuestions.length);
        callbacks.onStatusUpdate(`Asking (${i + 1}/${evalQuestions.length}): "${q.question}"`);

        currentTranscription = '';
        const startTime = performance.now();

        const turnPromise = new Promise<string>((resolve) => {
          turnResolver = resolve;
        });

        // Send question as text turn to the Live voice model
        await this.session.sendClientContent({
          turns: [{ parts: [{ text: q.question }] }],
        });

        const spokenAnswer = await turnPromise;
        const latencyMs = Math.round(performance.now() - startTime);

        callbacks.onStatusUpdate(`Grading answer for question ${i + 1} with LLM Judge...`);
        const score = await this.judge.evaluateAnswer({
          question: q.question,
          category: q.category,
          answer: spokenAnswer,
          expectedFacts: q.expectedFacts,
          hallucinationTraps: q.hallucinationTraps,
          biography,
          photoContexts: formattedPhotoContexts,
        });

        const result: QuestionEvalResult = {
          id: q.id,
          question: q.question,
          category: q.category,
          answer: spokenAnswer,
          expectedFacts: q.expectedFacts,
          score,
          latencyMs,
        };

        results.push(result);
        callbacks.onQuestionComplete(result);
      }

      callbacks.onStatusUpdate('Evaluation complete!');
      return results;
    } finally {
      if (this.session) {
        try {
          this.session.close();
        } catch (e) {
          // ignore close error
        }
        this.session = null;
      }
    }
  }

  /**
   * Computes aggregate summary metrics from a set of question results.
   */
  static calculateSummary(results: QuestionEvalResult[]): EvalRunSummary {
    if (results.length === 0) {
      return {
        totalQuestions: 0,
        passedCount: 0,
        passRatePercent: 0,
        avgFactualityScore: 0,
        hallucinationCount: 0,
        avgLatencyMs: 0,
      };
    }

    const totalQuestions = results.length;
    const passedCount = results.filter((r) => r.score.isPass).length;
    const passRatePercent = Math.round((passedCount / totalQuestions) * 100);
    const totalFactuality = results.reduce((acc, r) => acc + r.score.factualityScore, 0);
    const avgFactualityScore = Number((totalFactuality / totalQuestions).toFixed(1));
    const hallucinationCount = results.filter((r) => r.score.hasHallucination).length;
    const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
    const avgLatencyMs = Math.round(totalLatency / totalQuestions);

    return {
      totalQuestions,
      passedCount,
      passRatePercent,
      avgFactualityScore,
      hallucinationCount,
      avgLatencyMs,
    };
  }
}
