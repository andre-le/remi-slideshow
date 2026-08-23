import { GoogleGenAI, Type } from '@google/genai';

import { ToolVerificationResult } from './toolCallVerifier';

/**
 * Question and ground truth definition for evaluation.
 */
export interface EvalQuestion {
  id: string;
  question: string;
  category: string;
  expectedFacts: string[];
  hallucinationTraps?: string[];
}

/**
 * Input arguments for the LLM-as-a-Judge grading evaluation.
 */
export interface EvalJudgeInput {
  question: string;
  category: string;
  answer: string;
  expectedFacts: string[];
  hallucinationTraps?: string[];
  biography: string;
  photoContexts: string;
}

/**
 * Structured score and diagnostic evaluation breakdown produced by the Judge.
 */
export interface EvaluationScore {
  isPass: boolean;
  factualityScore: number; // 1 to 5 scale
  hasHallucination: boolean;
  toneScore: number; // 1 to 5 scale
  reasoning: string;
  missingFacts: string[];
  hallucinatedDetails: string[];
}

/**
 * Complete evaluation result record combining question, model transcript, judge scores, and tool results.
 */
export interface QuestionEvalResult {
  id: string;
  question: string;
  category: string;
  testType: 'qa' | 'tool';
  answer: string;
  expectedFacts: string[];
  score: EvaluationScore;
  latencyMs: number;
  toolResult?: ToolVerificationResult;
}

/**
 * VoiceEvalJudge
 *
 * An automated LLM-as-a-Judge agent powered by Gemini.
 * It evaluates voice responses against reference biographies, photo contexts,
 * and explicit ground-truth expected facts using a strict evaluation rubric.
 */
export class VoiceEvalJudge {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(client: GoogleGenAI, modelName = 'gemini-3.7-flash') {
    this.client = client;
    this.modelName = modelName;
  }

  /**
   * Evaluates a single model transcript answer against ground-truth facts and context.
   */
  async evaluateAnswer(input: EvalJudgeInput): Promise<EvaluationScore> {
    const systemInstruction = `You are a strict, objective AI Evaluation Judge assessing a Voice Assistant's spoken answers for a memory slideshow application.
Your job is to grade the assistant's response on factuality, absence of hallucinations, and conversational tone.

Evaluation Rubric:
1. Factuality Score (1-5):
   - 5: Contains all key expected facts accurately without factual errors.
   - 4: Mostly accurate, captures primary facts with minor omission of non-critical detail.
   - 3: Partially accurate, misses important expected facts but has no gross errors.
   - 2: Mostly inaccurate or answers wrong question.
   - 1: Completely incorrect, hallucinated, or irrelevant.

2. Hallucination Check (true/false):
   - true: The assistant invents facts contradictory to the biography/photo context or makes wild ungrounded assumptions.
   - false: All stated facts are grounded in the provided biography and photo context.

3. Tone & Conversational Quality (1-5):
   - 5: Natural, warm, polite, and well-suited for a voice conversation.
   - 1: Robotic, rude, or nonsensical.

4. Pass Determination (isPass):
   - true IF factualityScore >= 4 AND hasHallucination == false. Otherwise false.`;

    const userPrompt = `Ground Truth Biography:
"${input.biography}"

Ground Truth Photo Contexts:
"${input.photoContexts}"

Question:
"${input.question}"

Expected Facts:
${input.expectedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Known Hallucination Traps to avoid:
${(input.hallucinationTraps || []).map((t, i) => `- ${t}`).join('\n') || 'None'}

Actual Spoken Answer from Voice AI:
"${input.answer}"

Evaluate the answer and return your grading.`;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isPass: {
                type: Type.BOOLEAN,
                description: 'Whether the response meets the passing standard (factuality >= 4 and no hallucination).',
              },
              factualityScore: {
                type: Type.INTEGER,
                description: 'Score from 1 to 5 evaluating factual correctness against expected facts.',
              },
              hasHallucination: {
                type: Type.BOOLEAN,
                description: 'True if the response contains ungrounded or contradictory inventions.',
              },
              toneScore: {
                type: Type.INTEGER,
                description: 'Score from 1 to 5 evaluating conversational tone and spoken naturalness.',
              },
              reasoning: {
                type: Type.STRING,
                description: 'A concise 1-2 sentence explanation justifying the score.',
              },
              missingFacts: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of expected facts that were omitted or missing from the answer.',
              },
              hallucinatedDetails: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of specific hallucinated or inaccurate claims made.',
              },
            },
            required: ['isPass', 'factualityScore', 'hasHallucination', 'toneScore', 'reasoning', 'missingFacts', 'hallucinatedDetails'],
          },
        },
      });

      const parsed: EvaluationScore = JSON.parse(response.text || '{}');
      return {
        isPass: Boolean(parsed.isPass),
        factualityScore: Number(parsed.factualityScore) || 1,
        hasHallucination: Boolean(parsed.hasHallucination),
        toneScore: Number(parsed.toneScore) || 3,
        reasoning: parsed.reasoning || 'Evaluation completed.',
        missingFacts: parsed.missingFacts || [],
        hallucinatedDetails: parsed.hallucinatedDetails || [],
      };
    } catch (error) {
      console.error('Judge evaluation failed:', error);
      return {
        isPass: false,
        factualityScore: 1,
        hasHallucination: false,
        toneScore: 1,
        reasoning: `Judge evaluation error: ${(error as Error).message}`,
        missingFacts: input.expectedFacts,
        hallucinatedDetails: [],
      };
    }
  }
}
