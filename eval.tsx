import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { QuestionEvalResult } from './evalJudgeAgent';
import { VoiceEvalRunner, EvalRunSummary, EvalMode } from './voiceEvalRunner';

/**
 * GdmEval Web Component
 *
 * Interactive floating evaluation panel for benchmarking Voice AI against
 * ground-truth memory contexts, automated LLM-as-a-Judge grading across
 * categorical dimensions, and function calling / photo navigation verification.
 */
@customElement('gdm-eval')
export class GdmEval extends LitElement {
  @state() private results: QuestionEvalResult[] = [];
  @state() private summary: EvalRunSummary | null = null;
  @state() private status = 'Idle';
  @state() private currentQuestion: { id: string; question: string; category: string } | null = null;
  @state() private currentTranscription = '';
  @state() private isRunning = false;
  @state() private isOpen = false;
  @state() private selectedMode: EvalMode = 'all';

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
      width: 600px;
      max-height: 90vh;
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
      margin-bottom: 12px;
      padding-bottom: 10px;
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
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      color: #9ca3af;
    }

    /* Mode Selector */
    .mode-selector {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 14px;
      background: rgba(255, 255, 255, 0.04);
      padding: 4px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .mode-btn {
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 600;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #9ca3af;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .mode-btn.active {
      background: #2563eb;
      color: white;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
    }

    .run-btn {
      width: 100%;
      padding: 12px 20px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
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
      gap: 8px;
      margin-top: 14px;
      margin-bottom: 12px;
    }

    .summary-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 8px;
      text-align: center;
    }

    .summary-value {
      font-size: 17px;
      font-weight: 700;
      color: #ffffff;
    }

    .summary-label {
      font-size: 10px;
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

    /* Categorical Performance Matrix */
    .matrix-box {
      margin-top: 12px;
      margin-bottom: 14px;
      padding: 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .matrix-title {
      font-size: 12px;
      font-weight: 700;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .matrix-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .matrix-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      padding: 4px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.03);
    }

    .matrix-cat-name {
      font-weight: 600;
      color: #d1d5db;
    }

    .matrix-stats {
      display: flex;
      gap: 12px;
      align-items: center;
      font-size: 11px;
    }

    /* Live Stream Box */
    .live-stream-box {
      margin-top: 14px;
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
      margin-top: 14px;
      padding: 14px;
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

    .category-tag.bio {
      background: rgba(59, 130, 246, 0.2);
      color: #93c5fd;
      border: 1px solid rgba(59, 130, 246, 0.4);
    }

    .category-tag.vqa {
      background: rgba(16, 185, 129, 0.2);
      color: #6ee7b7;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .category-tag.relational {
      background: rgba(139, 92, 246, 0.2);
      color: #c4b5fd;
      border: 1px solid rgba(139, 92, 246, 0.4);
    }

    .category-tag.negative {
      background: rgba(245, 158, 11, 0.2);
      color: #fcd34d;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }

    .category-tag.tool {
      background: rgba(236, 72, 153, 0.2);
      color: #f472b6;
      border: 1px solid rgba(236, 72, 153, 0.4);
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
      margin-bottom: 8px;
    }

    .answer-quote {
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.3);
      border-left: 3px solid #3b82f6;
      font-size: 12px;
      line-height: 1.5;
      color: #e5e7eb;
      margin-bottom: 10px;
    }

    .tool-box {
      padding: 10px;
      border-radius: 6px;
      background: rgba(236, 72, 153, 0.08);
      border: 1px solid rgba(236, 72, 153, 0.2);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .tool-title {
      font-weight: 700;
      color: #f472b6;
      margin-bottom: 4px;
    }

    .judge-box {
      padding: 10px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 12px;
    }

    .judge-reasoning {
      color: #d1d5db;
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .diagnostic-list {
      margin: 4px 0 0 0;
      padding-left: 18px;
      color: #f87171;
    }
  `;

  private getCategoryClass(category: string): string {
    if (category.includes('Biographical')) return 'bio';
    if (category.includes('Visual')) return 'vqa';
    if (category.includes('Temporal') || category.includes('Relational')) return 'relational';
    if (category.includes('Negative') || category.includes('Out-of-Bounds')) return 'negative';
    if (category.includes('Tool') || category.includes('Photo Navigation')) return 'tool';
    return '';
  }

  private async runEvaluation() {
    this.results = [];
    this.summary = null;
    this.isRunning = true;
    this.status = 'Starting evaluation...';

    const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
    const runner = new VoiceEvalRunner(apiKey);

    try {
      const results = await runner.run(
        {
          onStatusUpdate: (status) => {
            this.status = status;
          },
          onQuestionStart: (q) => {
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
        },
        this.selectedMode
      );

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

              <!-- Mode / Category Selector -->
              <div class="mode-selector">
                <button
                  class="mode-btn ${this.selectedMode === 'all' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'all')}
                  ?disabled=${this.isRunning}
                >
                  All (19)
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'bio' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'bio')}
                  ?disabled=${this.isRunning}
                >
                  Biographical (3)
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'vqa' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'vqa')}
                  ?disabled=${this.isRunning}
                >
                  VQA Visuals (4)
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'relational' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'relational')}
                  ?disabled=${this.isRunning}
                >
                  Multi-Hop (3)
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'negative' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'negative')}
                  ?disabled=${this.isRunning}
                >
                  Negative Traps (3)
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'tool' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'tool')}
                  ?disabled=${this.isRunning}
                >
                  Tool Calling (6)
                </button>
              </div>

              <button class="run-btn" @click=${this.runEvaluation} ?disabled=${this.isRunning}>
                ${this.isRunning
                  ? '⏳ Running Benchmark...'
                  : `▶ Run ${
                      this.selectedMode === 'all'
                        ? 'Complete Suite'
                        : this.selectedMode === 'bio'
                        ? 'Biographical Suite'
                        : this.selectedMode === 'vqa'
                        ? 'VQA Suite'
                        : this.selectedMode === 'relational'
                        ? 'Multi-Hop Suite'
                        : this.selectedMode === 'negative'
                        ? 'Negative Traps Suite'
                        : 'Tool Calling Suite'
                    }`}
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

                    ${Object.keys(this.summary.categoryBreakdown).length > 0
                      ? html`
                          <div class="matrix-box">
                            <div class="matrix-title">Categorical Performance Matrix</div>
                            <div class="matrix-grid">
                              ${Object.values(this.summary.categoryBreakdown).map(
                                (c) => html`
                                  <div class="matrix-row">
                                    <span class="matrix-cat-name">${c.category}</span>
                                    <div class="matrix-stats">
                                      <span>${c.passed}/${c.total} passed</span>
                                      <strong
                                        class="${c.passRatePercent >= 80
                                          ? 'pass-rate-green'
                                          : c.passRatePercent >= 50
                                          ? 'pass-rate-amber'
                                          : 'pass-rate-red'}"
                                      >
                                        ${c.passRatePercent}%
                                      </strong>
                                      <span style="color: #9ca3af;">Factuality: ${c.avgFactuality}/5</span>
                                    </div>
                                  </div>
                                `
                              )}
                            </div>
                          </div>
                        `
                      : ''}
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
                        <span class="category-tag ${this.getCategoryClass(r.category)}">${r.category}</span>
                        <div style="display: flex; gap: 8px; align-items: center;">
                          <span style="font-size: 11px; color: #9ca3af;">${r.latencyMs}ms</span>
                          <span class="pass-tag ${r.score.isPass ? 'pass' : 'fail'}">
                            ${r.score.isPass ? '✓ PASS' : '✗ FAIL'}
                          </span>
                        </div>
                      </div>

                      <div class="question-title">Prompt: "${r.question}"</div>

                      <div class="answer-quote">
                        <strong>Spoken Response:</strong><br />
                        ${r.answer || '(No speech transcribed)'}
                      </div>

                      ${r.toolResult
                        ? html`
                            <div class="tool-box">
                              <div class="tool-title">
                                🔧 Tool Invocation Check:
                                <strong>${r.toolResult.toolCalled || 'None (No Tool Triggered)'}</strong>
                              </div>
                              <div style="color: #d1d5db; margin-top: 2px;">
                                <strong>Expected:</strong> ${r.toolResult.expectedTool}("${r.toolResult.expectedFileName}")
                              </div>
                              ${r.toolResult.calledArgs && Object.keys(r.toolResult.calledArgs).length > 0
                                ? html`
                                    <div style="color: #9ca3af; font-size: 11px; margin-top: 2px;">
                                      <strong>Arguments:</strong>
                                      ${JSON.stringify(r.toolResult.calledArgs)}
                                    </div>
                                  `
                                : ''}
                            </div>
                          `
                        : ''}

                      <div class="judge-box">
                        <div class="judge-reasoning">
                          <strong>Verdict:</strong> ${r.score.reasoning}
                        </div>

                        ${r.score.missingFacts.length > 0
                          ? html`
                              <div style="margin-top: 4px; color: #fbbf24; font-size: 11px;">
                                <strong>Diagnostics:</strong>
                                <ul class="diagnostic-list" style="color: #fbbf24;">
                                  ${r.score.missingFacts.map((mf) => html`<li>${mf}</li>`)}
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
