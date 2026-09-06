import { QuestionEvalResult } from './evalJudgeAgent';
import { EvalRunSummary } from './voiceEvalRunner';

/**
 * Structure of the exported evaluation report payload.
 */
export interface EvalExportReport {
  meta: {
    reportTitle: string;
    version: string;
    exportedAt: string;
    evalMode: string;
    models: {
      voiceAgent: string;
      llmJudge: string;
      toolVerifier: string;
    };
    targetPersona: string;
    datasetSource: string;
  };
  summary: EvalRunSummary;
  results: QuestionEvalResult[];
}

/**
 * Service class responsible for serializing, downloading, and copying
 * Voice AI evaluation test runs as structured JSON artifacts.
 */
export class EvalExportService {
  /**
   * Generates a strongly-typed, comprehensive evaluation report object.
   */
  static generateReport(
    results: QuestionEvalResult[],
    summary: EvalRunSummary,
    evalMode: string = 'all'
  ): EvalExportReport {
    return {
      meta: {
        reportTitle: 'Voice AI Memory Slideshow Evaluation Report',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        evalMode,
        models: {
          voiceAgent: 'gemini-2.5-flash-native-audio-preview-09-2025',
          llmJudge: 'gemini-3.7-flash',
          toolVerifier: 'gemini-3.7-flash',
        },
        targetPersona: 'Clara Sterling (1938–present)',
        datasetSource: '/eval_input/context.json',
      },
      summary,
      results,
    };
  }

  /**
   * Serializes the evaluation report to a prettified JSON string.
   */
  static exportToJsonString(
    results: QuestionEvalResult[],
    summary: EvalRunSummary,
    evalMode: string = 'all'
  ): string {
    const report = this.generateReport(results, summary, evalMode);
    return JSON.stringify(report, null, 2);
  }

  /**
   * Triggers a browser download of the evaluation results as a formatted .json file.
   */
  static downloadJson(
    results: QuestionEvalResult[],
    summary: EvalRunSummary,
    evalMode: string = 'all'
  ): void {
    const jsonString = this.exportToJsonString(results, summary, evalMode);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateFormatted = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `voice-eval-report-${evalMode}-${dateFormatted}.json`;

    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = fileName;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  }

  /**
   * Copies the JSON report directly to the system clipboard.
   */
  static async copyJsonToClipboard(
    results: QuestionEvalResult[],
    summary: EvalRunSummary,
    evalMode: string = 'all'
  ): Promise<boolean> {
    const jsonString = this.exportToJsonString(results, summary, evalMode);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(jsonString);
        return true;
      } else {
        // Fallback for environments where navigator.clipboard might be restricted
        const textarea = document.createElement('textarea');
        textarea.value = jsonString;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        return successful;
      }
    } catch (err) {
      console.error('Failed to copy JSON report to clipboard:', err);
      return false;
    }
  }
}
