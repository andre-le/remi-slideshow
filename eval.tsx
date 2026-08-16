import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { EvalQuestion, QuestionEvalResult } from './evalJudgeAgent';
import { VoiceEvalRunner, EvalRunSummary } from './voiceEvalRunner';

/**
 * GdmEval Web Component
 *
 * Interactive floating evaluation panel for benchmarking Voice AI against
 * ground-truth memory contexts and automated LLM-as-a-Judge grading.
 */
@customElement('gdm-eval')
export class GdmEval extends LitElement {
  @state() private results: QuestionEvalResult[] = [];
  @state() private summary: EvalRunSummary | null = null;
  @state() private status = 'Idle';
  @state() private currentQuestion: EvalQuestion | null = null;
  @state() private currentTranscription = '';
  @state() private isRunning = false;
  @state() private isOpen = false;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }

    .toggle-btn {
      position: absolute;
      top: 0;
      right: 0;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 50%;
      width: 44px;
      height: 44px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      font-size: 18px;
      transition: transform 0.2s ease, background 0.2s ease;
    }

    .toggle-btn:hover {
      transform: scale(1.05);
      background: linear-gradient(135deg, #3b82f6, #2563eb);
    }

    .panel {
      width: 520px;
      max-height: 88vh;
      padding: 24px;
      color: #f3f4f6;
      background: rgba(18, 18, 22, 0.96);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
      overflow-y: auto;
      backdrop-filter: blur(16px);
      box-sizing: border-box;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .panel-title {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-badge {
      display: inline-block;
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      color: #9ca3af;
      margin-bottom: 16px;
    }

    .run-btn {
      width: 100%;
      padding: 12px 20px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 15px;
      font-weight: 600;
      transition: background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .run-btn:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .run-btn:disabled {
      background: #374151;
      color: #9ca3af;
      cursor: not-allowed;
    }

    /* Summary Bar */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-top: 16px;
      margin-bottom: 20px;
    }

    .summary-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
    }

    .summary-value {
      font-size: 18px;
      font-weight: 700;
      color: #ffffff;
    }

    .summary-label {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .pass-rate-green {
      color: #34d399;
    }

    .pass-rate-amber {
      color: #fbbf24;
    }

    .pass-rate-red {
      color: #f87171;
    }

    /* Live Stream Box */
    .live-stream-box {
      margin-top: 16px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(37, 99, 235, 0.1);
      border: 1px solid rgba(37, 99, 235, 0.3);
      font-size: 13px;
      color: #93c5fd;
    }

    .live-stream-title {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .live-stream-text {
      font-style: italic;
      color: #e0f2fe;
    }

    /* Result Card */
    .result-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .category-tag {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      color: #d1d5db;
    }

    .pass-tag {
      font-size: 12px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .pass-tag.pass {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .pass-tag.fail {
      background: rgba(239, 68, 68, 0.2);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.4);
    }

    .question-title {
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 10px;
    }

    .answer-quote {
      padding: 10px 12px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.3);
      border-left: 3px solid #3b82f6;
      font-size: 13px;
      line-height: 1.5;
      color: #e5e7eb;
      margin-bottom: 12px;
    }

    .judge-box {
      padding: 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
    }

    .judge-scores {
      display: flex;
      gap: 16px;
      margin-bottom: 6px;
      color: #9ca3af;
    }

    .judge-score-item strong {
      color: #f3f4f6;
    }

    .judge-reasoning {
      color: #d1d5db;
      line-height: 1.4;
      margin-bottom: 6px;
    }

    .diagnostic-list {
      margin: 4px 0 0 0;
      padding-left: 18px;
      color: #f87171;
    }

    .expected-facts-list {
      margin: 4px 0 0 0;
      padding-left: 18px;
      color: #9ca3af;
    }
  `;

  private async runEvaluation() {
    this.results = [];
    this.summary = null;
    this.isRunning = true;
    this.status = 'Starting evaluation...';

    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    const runner = new VoiceEvalRunner(apiKey);

    try {
      const results = await runner.run({
        onStatusUpdate: (status) => {
          this.status = status;
        },
        onQuestionStart: (q, idx, total) => {
          this.currentQuestion = q;
          this.currentTranscription = '';
        },
        onTranscriptChunk: (chunk) => {
          this.currentTranscription += chunk;
        },
        onQuestionComplete: (result) => {
          this.results = [...this.results, result];
          this.summary = VoiceEvalRunner.calculateSummary(this.results);
          this.currentQuestion = null;
          this.currentTranscription = '';
        },
      });

      this.results = results;
      this.summary = VoiceEvalRunner.calculateSummary(results);
      this.status = 'Evaluation Complete';
    } catch (err: any) {
      console.error('Evaluation run error:', err);
      this.status = `Evaluation Failed: ${err.message || err}`;
    } finally {
      this.isRunning = false;
      this.currentQuestion = null;
    }
  }

  render() {
    return html`
      <button class="toggle-btn" @click=${() => (this.isOpen = !this.isOpen)} title="Toggle Voice AI Evaluation">
        ${this.isOpen ? '✕' : '📊'}
      </button>

      ${this.isOpen
        ? html`
            <div class="panel">
              <div class="panel-header">
                <div class="panel-title">
                  <span>📊</span> Voice AI Evaluation Suite
                </div>
                <span class="status-badge">${this.status}</span>
              </div>

              <button class="run-btn" @click=${this.runEvaluation} ?disabled=${this.isRunning}>
                ${this.isRunning ? '⏳ Running Benchmark...' : '▶ Run Evaluation Benchmark'}
              </button>

              ${this.summary
                ? html`
                    <div class="summary-grid">
                      <div class="summary-card">
                        <div
                          class="summary-value ${this.summary.passRatePercent >= 80
                            ? 'pass-rate-green'
                            : this.summary.passRatePercent >= 50
                            ? 'pass-rate-amber'
                            : 'pass-rate-red'}"
                        >
                          ${this.summary.passRatePercent}%
                        </div>
                        <div class="summary-label">Pass Rate</div>
                      </div>

                      <div class="summary-card">
                        <div class="summary-value">${this.summary.avgFactualityScore} / 5</div>
                        <div class="summary-label">Factuality</div>
                      </div>

                      <div class="summary-card">
                        <div
                          class="summary-value ${this.summary.hallucinationCount === 0
                            ? 'pass-rate-green'
                            : 'pass-rate-red'}"
                        >
                          ${this.summary.hallucinationCount}
                        </div>
                        <div class="summary-label">Hallucinations</div>
                      </div>

                      <div class="summary-card">
                        <div class="summary-value">${(this.summary.avgLatencyMs / 1000).toFixed(1)}s</div>
                        <div class="summary-label">Avg Latency</div>
                      </div>
                    </div>
                  `
                : ''}

              ${this.currentQuestion && this.currentTranscription
                ? html`
                    <div class="live-stream-box">
                      <div class="live-stream-title">🎤 Model Speaking: "${this.currentQuestion.question}"</div>
                      <div class="live-stream-text">${this.currentTranscription}</div>
                    </div>
                  `
                : ''}

              <div class="results-list">
                ${this.results.map(
                  (r) => html`
                    <div class="result-card">
                      <div class="card-header">
                        <span class="category-tag">${r.category}</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                          <span style="font-size: 11px; color: #9ca3af;">${r.latencyMs}ms</span>
                          <span class="pass-tag ${r.score.isPass ? 'pass' : 'fail'}">
                            ${r.score.isPass ? '✓ PASS' : '✗ FAIL'}
                          </span>
                        </div>
                      </div>

                      <div class="question-title">Q: ${r.question}</div>

                      <div class="answer-quote">
                        <strong>Spoken Answer:</strong><br />
                        ${r.answer || '(No speech transcribed)'}
                      </div>

                      <div class="judge-box">
                        <div class="judge-scores">
                          <span class="judge-score-item">Factuality: <strong>${r.score.factualityScore}/5</strong></span>
                          <span class="judge-score-item">Tone: <strong>${r.score.toneScore}/5</strong></span>
                          <span class="judge-score-item">
                            Hallucination:
                            <strong>${r.score.hasHallucination ? '⚠️ Detected' : '✓ None'}</strong>
                          </span>
                        </div>

                        <div class="judge-reasoning">
                          <strong>Judge Verdict:</strong> ${r.score.reasoning}
                        </div>

                        ${r.score.missingFacts.length > 0
                          ? html`
                              <div style="margin-top: 6px; color: #fbbf24; font-size: 11px;">
                                <strong>Missing Key Facts:</strong>
                                <ul class="diagnostic-list" style="color: #fbbf24;">
                                  ${r.score.missingFacts.map((mf) => html`<li>${mf}</li>`)}
                                </ul>
                              </div>
                            `
                          : ''}

                        ${r.score.hallucinatedDetails.length > 0
                          ? html`
                              <div style="margin-top: 6px; color: #f87171; font-size: 11px;">
                                <strong>Hallucinated Claims:</strong>
                                <ul class="diagnostic-list">
                                  ${r.score.hallucinatedDetails.map((hd) => html`<li>${hd}</li>`)}
                                </ul>
                              </div>
                            `
                          : ''}
                      </div>
                    </div>
                  `
                )}
              </div>
            </div>
          `
        : ''}
    `;
  }
}
