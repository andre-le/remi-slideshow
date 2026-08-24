import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { QuestionEvalResult } from './evalJudgeAgent';
import { VoiceEvalRunner, EvalRunSummary, EvalMode, CategoryMetric } from './voiceEvalRunner';

/**
 * GdmEval Web Component
 *
 * Interactive floating evaluation panel for benchmarking Voice AI against
 * ground-truth memory contexts, automated LLM-as-a-Judge grading across
 * categorical dimensions, streaming TTFT latency, and tool verification.
 */
@customElement('gdm-eval')
export class GdmEval extends LitElement {
  @state() private results: QuestionEvalResult[] = [];
  @state() private summary: EvalRunSummary | null = null;
  @state() private status = 'Idle';
  @state() private currentQuestion: { id: string; question: string; category: string } | null = null;
  @state() private currentTranscription = '';
  @state() private currentTtftMs: number | null = null;
  @state() private isRunning = false;
  @state() private isOpen = false;
  @state() private selectedMode: EvalMode = 'all';
  @state() private viewFilter: string = 'all';

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
      width: 630px;
      max-height: 90vh;
      padding: 24px;
      color: #f3f4f6;
      background: rgba(18, 18, 24, 0.97);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 16px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7);
      overflow-y: auto;
      backdrop-filter: blur(20px);
      box-sizing: border-box;
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
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
      font-size: 11px;
      padding: 3px 10px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.08);
      color: #9ca3af;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    /* Suite Tabs */
    .tab-section-label {
      font-size: 11px;
      font-weight: 600;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }

    .mode-selector {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      margin-bottom: 14px;
    }

    .mode-btn {
      padding: 8px 10px;
      font-size: 11px;
      font-weight: 600;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      color: #9ca3af;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;
    }

    .mode-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.07);
      color: #ffffff;
      border-color: rgba(255, 255, 255, 0.15);
    }

    .mode-btn.active {
      background: rgba(37, 99, 235, 0.25);
      border-color: #3b82f6;
      color: #ffffff;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.3);
    }

    .mode-btn .mode-title {
      font-size: 12px;
      font-weight: 700;
    }

    .mode-btn .mode-count {
      font-size: 10px;
      color: #60a5fa;
    }

    .run-btn {
      width: 100%;
      padding: 12px 20px;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      transition: transform 0.15s ease, background 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
    }

    .run-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      background: linear-gradient(135deg, #3b82f6, #2563eb);
    }

    .run-btn:disabled {
      background: #374151;
      color: #9ca3af;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Overall Summary Grid - 5 KPIs including TTFT */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 6px;
      margin-top: 14px;
      margin-bottom: 12px;
    }

    .summary-card {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 10px 6px;
      text-align: center;
    }

    .summary-value {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
    }

    .summary-label {
      font-size: 9px;
      color: #9ca3af;
      margin-top: 3px;
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

    .ttft-badge {
      color: #38bdf8;
    }

    /* Category Performance Matrix Card */
    .matrix-card {
      margin-top: 14px;
      margin-bottom: 14px;
      padding: 14px;
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .matrix-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }

    .matrix-title {
      font-size: 13px;
      font-weight: 700;
      color: #93c5fd;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .matrix-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .matrix-row-item {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.025);
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: background 0.15s ease, border-color 0.15s ease;
      cursor: pointer;
    }

    .matrix-row-item:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
    }

    .matrix-row-item.filter-active {
      border-color: #3b82f6;
      background: rgba(37, 99, 235, 0.1);
    }

    .matrix-row-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .matrix-cat-name {
      font-size: 12px;
      font-weight: 700;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .matrix-cat-score {
      font-size: 12px;
      font-weight: 700;
    }

    .matrix-bar-track {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 9999px;
      overflow: hidden;
      margin-bottom: 6px;
    }

    .matrix-bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.4s ease;
    }

    .matrix-row-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9ca3af;
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

    .live-stream-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .live-stream-title {
      font-weight: 600;
    }

    .live-stream-ttft {
      font-size: 11px;
      font-weight: 700;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.15);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .live-stream-text {
      font-style: italic;
      color: #e0f2fe;
    }

    /* Results List & Cards */
    .results-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      margin-bottom: 8px;
    }

    .results-count {
      font-size: 12px;
      font-weight: 600;
      color: #9ca3af;
    }

    .clear-filter-btn {
      font-size: 11px;
      color: #60a5fa;
      background: none;
      border: none;
      cursor: pointer;
      text-decoration: underline;
      padding: 0;
    }

    .result-card {
      margin-top: 10px;
      padding: 14px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: border-color 0.15s ease;
    }

    .result-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
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

    .metrics-header-group {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .latency-pill {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #9ca3af;
    }

    .latency-pill strong {
      color: #38bdf8;
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
      background: rgba(0, 0, 0, 0.35);
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
      border: 1px solid rgba(236, 72, 153, 0.25);
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

  private getBarGradient(passRate: number): string {
    if (passRate >= 80) return 'linear-gradient(90deg, #059669, #10b981)';
    if (passRate >= 50) return 'linear-gradient(90deg, #d97706, #f59e0b)';
    return 'linear-gradient(90deg, #dc2626, #ef4444)';
  }

  private async runEvaluation() {
    this.results = [];
    this.summary = null;
    this.viewFilter = 'all';
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
            this.currentTtftMs = null;
          },
          onTranscriptChunk: (chunk, ttftMs) => {
            this.currentTranscription += chunk;
            if (ttftMs !== undefined) {
              this.currentTtftMs = ttftMs;
            }
          },
          onQuestionComplete: (result) => {
            this.results = [...this.results, result];
            this.summary = VoiceEvalRunner.calculateSummary(this.results);
            this.currentQuestion = null;
            this.currentTranscription = '';
            this.currentTtftMs = null;
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

  private toggleViewFilter(cat: string) {
    if (this.viewFilter === cat) {
      this.viewFilter = 'all';
    } else {
      this.viewFilter = cat;
    }
  }

  render() {
    const displayedResults =
      this.viewFilter === 'all'
        ? this.results
        : this.results.filter((r) => r.category.toLowerCase().includes(this.viewFilter.toLowerCase()));

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

              <!-- Mode / Category Selector Grid -->
              <div class="tab-section-label">Select Capability Suite to Benchmark:</div>
              <div class="mode-selector">
                <button
                  class="mode-btn ${this.selectedMode === 'all' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'all')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">🌐 All Suites</span>
                  <span class="mode-count">19 Total Tests</span>
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'bio' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'bio')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">👤 Biographical</span>
                  <span class="mode-count">3 Recall Tests</span>
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'vqa' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'vqa')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">🖼️ VQA Visuals</span>
                  <span class="mode-count">4 Image Tests</span>
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'relational' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'relational')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">⏳ Multi-Hop</span>
                  <span class="mode-count">3 Kinship/Math</span>
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'negative' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'negative')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">🛡️ Negative Traps</span>
                  <span class="mode-count">3 Uncertainty</span>
                </button>
                <button
                  class="mode-btn ${this.selectedMode === 'tool' ? 'active' : ''}"
                  @click=${() => (this.selectedMode = 'tool')}
                  ?disabled=${this.isRunning}
                >
                  <span class="mode-title">🔧 Tool Calling</span>
                  <span class="mode-count">6 Action Tests</span>
                </button>
              </div>

              <button class="run-btn" @click=${this.runEvaluation} ?disabled=${this.isRunning}>
                ${this.isRunning
                  ? '⏳ Running Benchmark Suite...'
                  : `▶ Run ${
                      this.selectedMode === 'all'
                        ? 'Complete Benchmark (19 Tests)'
                        : this.selectedMode === 'bio'
                        ? 'Biographical Recall (3 Tests)'
                        : this.selectedMode === 'vqa'
                        ? 'VQA Visual Suite (4 Tests)'
                        : this.selectedMode === 'relational'
                        ? 'Multi-Hop Suite (3 Tests)'
                        : this.selectedMode === 'negative'
                        ? 'Negative Traps Suite (3 Tests)'
                        : 'Tool Calling Suite (6 Tests)'
                    }`}
              </button>

              ${this.summary
                ? html`
                    <!-- Executive KPI Cards with Streaming TTFT Latency -->
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
                        <div class="summary-value ttft-badge">${this.summary.avgTtftMs}ms</div>
                        <div class="summary-label">Avg TTFT</div>
                      </div>

                      <div class="summary-card">
                        <div class="summary-value">${(this.summary.avgLatencyMs / 1000).toFixed(1)}s</div>
                        <div class="summary-label">Avg Turn</div>
                      </div>
                    </div>

                    <!-- Categorical Performance Matrix Visual Breakdown Card -->
                    ${Object.keys(this.summary.categoryBreakdown).length > 0
                      ? html`
                          <div class="matrix-card">
                            <div class="matrix-header">
                              <div class="matrix-title">
                                <span>📈</span> Categorical Performance Matrix
                              </div>
                              <span style="font-size: 11px; color: #9ca3af;">Click row to filter view</span>
                            </div>
                            <div class="matrix-rows">
                              ${Object.values(this.summary.categoryBreakdown).map(
                                (c: CategoryMetric) => html`
                                  <div
                                    class="matrix-row-item ${this.viewFilter === c.category ? 'filter-active' : ''}"
                                    @click=${() => this.toggleViewFilter(c.category)}
                                    title="Filter results by ${c.category}"
                                  >
                                    <div class="matrix-row-top">
                                      <span class="matrix-cat-name">
                                        <span class="category-tag ${this.getCategoryClass(c.category)}">
                                          ${c.category}
                                        </span>
                                      </span>
                                      <span
                                        class="matrix-cat-score ${c.passRatePercent >= 80
                                          ? 'pass-rate-green'
                                          : c.passRatePercent >= 50
                                          ? 'pass-rate-amber'
                                          : 'pass-rate-red'}"
                                      >
                                        ${c.passRatePercent}%
                                      </span>
                                    </div>

                                    <div class="matrix-bar-track">
                                      <div
                                        class="matrix-bar-fill"
                                        style="width: ${c.passRatePercent}%; background: ${this.getBarGradient(
                                          c.passRatePercent
                                        )};"
                                      ></div>
                                    </div>

                                    <div class="matrix-row-meta">
                                      <span><strong>${c.passed}/${c.total}</strong> passed</span>
                                      <span>Factuality: <strong>${c.avgFactuality}/5</strong></span>
                                      <span>⚡ TTFT: <strong>${c.avgTtftMs}ms</strong></span>
                                      <span>
                                        Hallucinations:
                                        <strong style="color: ${c.hallucinationCount > 0 ? '#f87171' : '#34d399'}">
                                          ${c.hallucinationCount}
                                        </strong>
                                      </span>
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

              <!-- Real-time Live Transcription Box with Live TTFT -->
              ${this.currentQuestion && this.currentTranscription
                ? html`
                    <div class="live-stream-box">
                      <div class="live-stream-header">
                        <span class="live-stream-title">🎤 Model Speaking: "${this.currentQuestion.question}"</span>
                        ${this.currentTtftMs !== null
                          ? html`<span class="live-stream-ttft">⚡ TTFT: ${this.currentTtftMs}ms</span>`
                          : ''}
                      </div>
                      <div class="live-stream-text">${this.currentTranscription}</div>
                    </div>
                  `
                : ''}

              <!-- Test Result Cards -->
              ${this.results.length > 0
                ? html`
                    <div class="results-header">
                      <span class="results-count">
                        Showing ${displayedResults.length} of ${this.results.length} results
                        ${this.viewFilter !== 'all' ? `(Filtered: ${this.viewFilter})` : ''}
                      </span>
                      ${this.viewFilter !== 'all'
                        ? html`
                            <button class="clear-filter-btn" @click=${() => (this.viewFilter = 'all')}>
                              Clear Filter
                            </button>
                          `
                        : ''}
                    </div>

                    <div class="results-list">
                      ${displayedResults.map(
                        (r) => html`
                          <div class="result-card">
                            <div class="card-header">
                              <span class="category-tag ${this.getCategoryClass(r.category)}">${r.category}</span>
                              <div class="metrics-header-group">
                                <span class="latency-pill" title="Time to First Transcript Chunk">
                                  ⚡ TTFT: <strong>${r.ttftMs ?? r.latencyMs}ms</strong>
                                </span>
                                <span class="latency-pill" title="Total Turn Duration">
                                  ⏱️ Total: <strong>${r.latencyMs}ms</strong>
                                </span>
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
                                      <strong>Expected:</strong> ${r.toolResult.expectedTool}("${r.toolResult
                                        .expectedFileName}")
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
                  `
                : ''}
            </div>
          `
        : ''}
    `;
  }
}
