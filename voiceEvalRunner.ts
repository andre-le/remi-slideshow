import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from '@google/genai';
import { analyzeImage, urlToBase64, ImageInfo } from './imageAnalyzerAgent';
import { generateSystemPrompt } from './liveAgent';
import { EvalQuestion, QuestionEvalResult, VoiceEvalJudge } from './evalJudgeAgent';
import { ToolCallVerifier, EvalToolQuestion } from './toolCallVerifier';

/**
 * Supported benchmark evaluation modes.
 */
export type EvalMode = 'all' | 'bio' | 'vqa' | 'relational' | 'negative' | 'tool';

/**
 * Progress and event callbacks for the evaluation runner.
 */
export interface EvalRunnerCallbacks {
  onStatusUpdate: (status: string) => void;
  onQuestionStart: (question: { id: string; question: string; category: string }, index: number, total: number) => void;
  onTranscriptChunk: (chunk: string) => void;
  onQuestionComplete: (result: QuestionEvalResult) => void;
}

/**
 * Summary metrics for an individual test category.
 */
export interface CategoryMetric {
  category: string;
  total: number;
  passed: number;
  passRatePercent: number;
  avgFactuality: number;
  hallucinationCount: number;
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
  toolPassCount: number;
  toolTotalCount: number;
  toolAccuracyPercent: number;
  categoryBreakdown: Record<string, CategoryMetric>;
}

/**
 * VoiceEvalRunner
 *
 * Orchestrates the end-to-end evaluation lifecycle:
 * 1. Loads context and AI-analyzes multimodal images.
 * 2. Assembles system instructions and boots Gemini Live session.
 * 3. Dispatches benchmark questions sequentially across categories.
 * 4. Measures response latency and streams transcripts.
 * 5. Grades with VoiceEvalJudge and ToolCallVerifier (Gemini 3.7 Flash).
 */
export class VoiceEvalRunner {
  private client: GoogleGenAI;
  private judge: VoiceEvalJudge;
  private toolVerifier: ToolCallVerifier;
  private session: Session | null = null;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.judge = new VoiceEvalJudge(this.client, 'gemini-3.7-flash');
    this.toolVerifier = new ToolCallVerifier(this.client, 'gemini-3.7-flash');
  }

  /**
   * Runs the complete evaluation suite against the provided dataset.
   */
  async run(callbacks: EvalRunnerCallbacks, mode: EvalMode = 'all'): Promise<QuestionEvalResult[]> {
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
      let qaQuestions: EvalQuestion[] = contextData.evalQuestions || [];
      let toolQuestions: EvalToolQuestion[] = contextData.evalToolQuestions || [];

      // Filter questions based on selected mode
      if (mode === 'bio') {
        qaQuestions = qaQuestions.filter((q) => q.category === 'Biographical Recall');
        toolQuestions = [];
      } else if (mode === 'vqa') {
        qaQuestions = qaQuestions.filter((q) => q.category === 'Visual Question Answering (VQA)');
        toolQuestions = [];
      } else if (mode === 'relational') {
        qaQuestions = qaQuestions.filter((q) => q.category === 'Temporal & Relational Multi-Hop Reasoning');
        toolQuestions = [];
      } else if (mode === 'negative') {
        qaQuestions = qaQuestions.filter((q) => q.category === 'Negative / Out-of-Bounds Resistance');
        toolQuestions = [];
      } else if (mode === 'tool') {
        qaQuestions = [];
      }

      callbacks.onStatusUpdate(`Analyzing ${photos.length} evaluation images with Gemini Vision...`);
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

      // 1. Run Q&A Benchmark Questions
      if (qaQuestions.length > 0) {
        const totalQA = qaQuestions.length;
        for (let i = 0; i < totalQA; i++) {
          const q = qaQuestions[i];
          callbacks.onQuestionStart(q, i, totalQA);
          callbacks.onStatusUpdate(`Asking Q&A (${i + 1}/${totalQA}) [${q.category}]: "${q.question}"`);

          currentTranscription = '';
          const startTime = performance.now();

          const turnPromise = new Promise<string>((resolve) => {
            turnResolver = resolve;
          });

          await this.session.sendClientContent({
            turns: [{ parts: [{ text: q.question }] }],
          });

          const spokenAnswer = await turnPromise;
          const latencyMs = Math.round(performance.now() - startTime);

          callbacks.onStatusUpdate(`Grading answer for question ${i + 1} with LLM Judge (Gemini 3.7)...`);
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
            testType: 'qa',
            answer: spokenAnswer,
            expectedFacts: q.expectedFacts,
            score,
            latencyMs,
          };

          results.push(result);
          callbacks.onQuestionComplete(result);
        }
      }

      // 2. Run Function Calling & Navigation Benchmarks
      if (toolQuestions.length > 0) {
        const totalTools = toolQuestions.length;
        for (let i = 0; i < totalTools; i++) {
          const t = toolQuestions[i];
          callbacks.onQuestionStart(t, i, totalTools);
          callbacks.onStatusUpdate(`Testing Tool Trigger (${i + 1}/${totalTools}): "${t.question}"`);

          currentTranscription = '';
          const startTime = performance.now();

          const turnPromise = new Promise<string>((resolve) => {
            turnResolver = resolve;
          });

          // Send prompt with active photo context in a single atomic turn to prevent desync
          const promptWithContext = t.currentPhotoFileName
            ? `[The photo "${t.currentPhotoFileName}" is currently displayed on screen.] User asks: ${t.question}`
            : t.question;

          await this.session.sendClientContent({
            turns: [{ parts: [{ text: promptWithContext }] }],
          });

          const spokenAnswer = await turnPromise;
          const latencyMs = Math.round(performance.now() - startTime);

          callbacks.onStatusUpdate(`Verifying Tool Execution for: "${t.expectedTool}"...`);
          const targetPhotoInfo = enrichedPhotos.find((p) => p.fileName === t.currentPhotoFileName);
          const currentContext = targetPhotoInfo?.context || '';

          const toolResult = await this.toolVerifier.evaluateToolCall({
            spokenText: spokenAnswer,
            userPrompt: t.question,
            currentPhotoFileName: t.currentPhotoFileName,
            currentContext,
            availablePhotos: enrichedPhotos,
            expectedTool: t.expectedTool,
            expectedFileName: t.expectedFileName,
            expectedKeywords: t.expectedKeywords,
          });

          const result: QuestionEvalResult = {
            id: t.id,
            question: t.question,
            category: t.category,
            testType: 'tool',
            answer: spokenAnswer,
            expectedFacts: [
              `Expected Tool: ${t.expectedTool}`,
              `Expected File: ${t.expectedFileName}`,
            ],
            score: {
              isPass: toolResult.isPass,
              factualityScore: toolResult.isPass ? 5 : 1,
              hasHallucination: false,
              toneScore: spokenAnswer ? 4 : 1,
              reasoning: toolResult.gradeReason,
              missingFacts: toolResult.isPass ? [] : [`Failed to invoke ${t.expectedTool} on ${t.expectedFileName}`],
              hallucinatedDetails: [],
            },
            latencyMs,
            toolResult,
          };

          results.push(result);
          callbacks.onQuestionComplete(result);
        }
      }

      callbacks.onStatusUpdate('Evaluation suite complete!');
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
        toolPassCount: 0,
        toolTotalCount: 0,
        toolAccuracyPercent: 0,
        categoryBreakdown: {},
      };
    }

    const totalQuestions = results.length;
    const passedCount = results.filter((r) => r.score.isPass).length;
    const passRatePercent = Math.round((passedCount / totalQuestions) * 100);

    const qaResults = results.filter((r) => r.testType === 'qa');
    const totalFactuality = qaResults.reduce((acc, r) => acc + r.score.factualityScore, 0);
    const avgFactualityScore = qaResults.length > 0 ? Number((totalFactuality / qaResults.length).toFixed(1)) : 0;
    const hallucinationCount = qaResults.filter((r) => r.score.hasHallucination).length;

    const toolResults = results.filter((r) => r.testType === 'tool');
    const toolTotalCount = toolResults.length;
    const toolPassCount = toolResults.filter((r) => r.toolResult?.isPass).length;
    const toolAccuracyPercent = toolTotalCount > 0 ? Math.round((toolPassCount / toolTotalCount) * 100) : 0;

    const totalLatency = results.reduce((acc, r) => acc + r.latencyMs, 0);
    const avgLatencyMs = Math.round(totalLatency / totalQuestions);

    // Compute granular per-category breakdown
    const categoryBreakdown: Record<string, CategoryMetric> = {};
    for (const r of results) {
      const cat = r.category;
      if (!categoryBreakdown[cat]) {
        categoryBreakdown[cat] = {
          category: cat,
          total: 0,
          passed: 0,
          passRatePercent: 0,
          avgFactuality: 0,
          hallucinationCount: 0,
        };
      }
      categoryBreakdown[cat].total += 1;
      if (r.score.isPass) {
        categoryBreakdown[cat].passed += 1;
      }
      if (r.score.hasHallucination) {
        categoryBreakdown[cat].hallucinationCount += 1;
      }
    }

    for (const cat of Object.keys(categoryBreakdown)) {
      const metric = categoryBreakdown[cat];
      metric.passRatePercent = Math.round((metric.passed / metric.total) * 100);
      const catResults = results.filter((r) => r.category === cat);
      const catFactualityTotal = catResults.reduce((acc, r) => acc + r.score.factualityScore, 0);
      metric.avgFactuality = Number((catFactualityTotal / metric.total).toFixed(1));
    }

    return {
      totalQuestions,
      passedCount,
      passRatePercent,
      avgFactualityScore,
      hallucinationCount,
      avgLatencyMs,
      toolPassCount,
      toolTotalCount,
      toolAccuracyPercent,
      categoryBreakdown,
    };
  }
}
