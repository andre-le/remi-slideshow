import {
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
} from '@google/genai';
import {LitElement, html, css} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import { analyzeImage, urlToBase64, ImageInfo } from './imageAnalyzerAgent';
import { generateSystemPrompt } from './liveAgent';

@customElement('gdm-eval')
export class GdmEval extends LitElement {
  @state() private results: {question: string; answer: string}[] = [];
  @state() private status = 'Idle';
  @state() private currentTranscription = '';
  @state() private isOpen = false;

  private client: GoogleGenAI;
  private session: Session;
  private sessionPromise: Promise<Session>;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
    }
    .panel {
      width: 400px;
      max-height: 90vh;
      padding: 20px;
      font-family: sans-serif;
      color: white;
      background: rgba(26, 26, 26, 0.95);
      border: 1px solid #444;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      overflow-y: auto;
      backdrop-filter: blur(10px);
    }
    .toggle-btn {
      position: absolute;
      top: 0;
      right: 0;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .result-item {
      margin-bottom: 20px;
      padding: 15px;
      border: 1px solid #444;
      border-radius: 8px;
      background: #2a2a2a;
    }
    .question {
      font-weight: bold;
      color: #00ff00;
      margin-bottom: 5px;
    }
    .answer {
      white-space: pre-wrap;
    }
    .status {
      margin-bottom: 20px;
      font-style: italic;
      color: #aaa;
    }
    button {
      padding: 10px 20px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }
    button:disabled {
      background: #555;
    }
  `;

  private async initSession(systemInstruction: string) {
    const model = 'gemini-2.5-flash-native-audio-preview-09-2025';

    this.sessionPromise = this.client.live.connect({
      model: model,
      callbacks: {
        onopen: () => {
          this.status = 'Session Opened';
        },
        onmessage: async (message: LiveServerMessage) => {
          const serverContent = message.serverContent as any;
          if (!serverContent) return;

          if (serverContent.outputTranscription) {
            this.currentTranscription += serverContent.outputTranscription.text;
          }

          if (serverContent.turnComplete) {
            this.dispatchEvent(new CustomEvent('turn-complete', {
              detail: { transcription: this.currentTranscription }
            }));
            this.currentTranscription = '';
          }
        },
        onerror: (e) => {
          console.error('Session Error:', e);
          this.status = 'Error: ' + e;
        },
        onclose: () => {
          this.status = 'Session Closed';
        }
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: systemInstruction,
        outputAudioTranscription: {},
      }
    });

    this.session = await this.sessionPromise;
  }

  private async runEvaluation() {
    this.results = [];
    this.status = 'Loading context...';

    try {
      this.client = new GoogleGenAI({
        apiKey: process.env.API_KEY,
      });

      const contextResponse = await fetch('/eval_input/context.json');
      const contextData = await contextResponse.json();

      const biography = contextData.biography;
      const photos: {fileName: string; context: string}[] = contextData.photos;

      this.status = 'Analyzing images...';
      const enrichedPhotos = await Promise.all(photos.map(async (p) => {
        try {
          const { base64, mimeType } = await urlToBase64(`/eval_input/${p.fileName}`);
          const aiContext = await analyzeImage(this.client, mimeType, base64);
          return { ...p, aiContext, mimeType, base64, url: `/eval_input/${p.fileName}` } as ImageInfo;
        } catch (e) {
          console.error(`Failed to analyze ${p.fileName}`, e);
          return { ...p, aiContext: 'Analysis failed', mimeType: 'image/jpeg', base64: '', url: '' } as ImageInfo;
        }
      }));

      const systemInstruction = generateSystemPrompt(enrichedPhotos, biography) || 'You are a helpful assistant.';

      this.status = 'Initializing session...';
      await this.initSession(systemInstruction);

      const questions = [
        "Who is Clara Sterling and where does she live?",
        "When did Clara and Arthur get married?",
        "Who are Clara's daughters and where do they live?",
        "Tell me about the photo of Arthur in the backyard garden.",
        "What trip is shown in the mountain hiking photo?"
      ];

      for (const question of questions) {
        this.status = `Asking: ${question}`;
        this.currentTranscription = '';

        const turnCompletePromise = new Promise<string>((resolve) => {
          const handler = (e: any) => {
            this.removeEventListener('turn-complete', handler);
            resolve(e.detail.transcription);
          };
          this.addEventListener('turn-complete', handler);
        });

        // NOTE: we send the questions to the Live AI using text here, whereas in production the question is sent as audio.
        // This is a key difference between the eval and production.
        await this.session.sendClientContent({ turns: [{ parts: [{ text: question }] }] });

        const answer = await turnCompletePromise;
        this.results = [...this.results, { question, answer }];
        console.log(`Q: ${question}\nA: ${answer}\n---`);
      }

      this.status = 'Evaluation Complete';
      this.session.close();

    } catch (error) {
      console.error('Evaluation failed:', error);
      this.status = 'Evaluation Failed: ' + error.message;
    }
  }

  render() {
    return html`
      <button class="toggle-btn" @click=${() => this.isOpen = !this.isOpen}>
        ${this.isOpen ? '✕' : '📊'}
      </button>

      ${this.isOpen ? html`
        <div class="panel">
          <h1>Voice AI Evaluation</h1>
          <div class="status">Status: ${this.status}</div>
          <button @click=${this.runEvaluation} ?disabled=${this.status.startsWith('Asking') || this.status === 'Initializing session...'}>
            Run Evaluation
          </button>

          <div style="margin-top: 20px;">
            ${this.results.map(r => html`
              <div class="result-item">
                <div class="question">Q: ${r.question}</div>
                <div class="answer">A: ${r.answer}</div>
              </div>
            `)}
          </div>
        </div>
      ` : ''}
    `;
  }
}
