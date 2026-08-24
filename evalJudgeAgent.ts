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
  ttftMs?: number; // Time to First Transcript chunk (streaming latency)
  toolResult?: ToolVerificationResult;
}

/**
 * VoiceEvalJudge
 *
 * An automated LLM-as-a-Judge agent powered by Gemini.
 * It evaluates voice responses against reference biographies, photo contexts,
 * and explicit ground-truth expected facts using a strict categorical evaluation rubric.
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
Your job is to grade the assistant's response on factuality, absence of hallucinations, and conversational tone across diverse capability categories.

Category-Specific Evaluation Guidelines:
1. 'Negative / Out-of-Bounds Resistance' & Uncertainty Calibration:
   - When a question asks about unmentioned, fictitious, or false premises (e.g. non-existent trips to Paris, non-existent sons, unlisted universities):
     * EXCELLENT (Score 5 / Pass): The assistant gracefully acknowledges uncertainty, clarifies the absence of records, or gently corrects the false premise (e.g. "Clara only has two daughters, not a son", "There is no record of Clara visiting Paris").
     * CRITICAL FAILURE (Score 1 / Fail): The assistant fabricates stories, fake dates, or imaginary occupations not supported by the context. Mark hasHallucination = true.

2. 'Temporal & Relational Multi-Hop Reasoning':
   - Grade multi-step inferences (such as calculating marriage duration from 1965 to 2021 = 56 years) and relational mappings (e.g., grandsons vs granddaughter, sons-in-law to correct daughters). Full accuracy is required for Score 5.

3. 'Visual Question Answering (VQA)' & 'Biographical Recall':
   - Grade precision of visual details (e.g. yellow tennis ball, marionberry lattice pie, greenhouse orchids) and biographical milestones.

Evaluation Rubric:
1. Factuality Score (1-5):
   - 5: Perfectly accurate, captures key expected facts or correctly admits uncertainty for out-of-bounds queries.
   - 4: Mostly accurate, captures primary facts with minor omission of non-critical detail.
   - 3: Partially accurate, misses important expected facts or provides vague answers.
   - 2: Mostly inaccurate or answers the wrong question.
   - 1: Completely incorrect, fabricated/hallucinated, or irrelevant.

2. Hallucination Check (true/false):
   - true: The assistant invents ungrounded facts, makes contradictory claims, or falls for negative traps.
   - false: All stated facts are grounded in the provided biography and photo context, or uncertainty was appropriately admitted.

3. Tone & Conversational Quality (1-5):
   - 5: Natural, warm, empathetic, polite, and well-suited for a voice conversation.
   - 1: Robotic, rude, dismissive, or nonsensical.

4. Pass Determination (isPass):
   - true IF factualityScore >= 4 AND hasHallucination == false. Otherwise false.`;

    const userPrompt = `Test Category: "${input.category}"

Ground Truth Biography:
"${input.biography}"

Ground Truth Photo Contexts:
"${input.photoContexts}"

Question:
"${input.question}"

Expected Facts / Uncertainty Criteria:
${input.expectedFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Known Hallucination Traps to avoid:
${(input.hallucinationTraps || []).map((t, i) => `- ${t}`).join('\n') || 'None'}

Actual Spoken Answer from Voice AI:
"${input.answer}"

Evaluate the answer according to the categorical rubric and return your grading.`;

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
                description: 'Score from 1 to 5 evaluating factual correctness and uncertainty calibration.',
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
                description: 'List of expected facts or corrections that were omitted.',
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
