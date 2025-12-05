/* tslint:disable */
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Blob,
  GenerateContentResponse,
  GoogleGenAI,
  LiveServerMessage,
  Modality,
  Session,
  Type,
} from '@google/genai';
import {LitElement, html} from 'lit';
import {customElement, state} from 'lit/decorators.js';
import {appStyles} from './app.styles';
import {createBlob, decode, decodeAudioData, encode} from './utils';
import './visual-3d';

interface ImageInfo {
  fileName: string;
  mimeType: string;
  base64: string;
  context: string;
  aiContext: string;
  url: string;
}

@customElement('gdm-app')
export class GdmApp extends LitElement {
  @state() activeTab: 'audio' | 'image' = 'audio';

  // Audio tab state
  @state() isRecording = false;
  @state() status = '';
  @state() error = '';

  // Image tab state
  @state() imageInfos: ImageInfo[] = [];
  @state() isProcessingFiles = false;
  @state() imagePrompt = '';
  @state() imageResponse = '';
  @state() isAnsweringQuestion = false;
  @state() imageError = '';
  @state() private isContextApplied = false;
  @state() private currentImageIndex = 0;
  @state() biography = '';
  @state() showContext = true;
  @state() debugLogs: string[] = [];
  @state() applyContextMessage = '';

  private client: GoogleGenAI;
  private session: Session;
  // FIX: Add sessionPromise to follow Gemini API guidelines for handling live sessions.
  private sessionPromise: Promise<Session>;
  private inputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 16000});
  private outputAudioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)({sampleRate: 24000});
  @state() inputNode = this.inputAudioContext.createGain();
  @state() outputNode = this.outputAudioContext.createGain();
  private nextStartTime = 0;
  private mediaStream: MediaStream;
  private sourceNode: AudioBufferSourceNode;
  private scriptProcessorNode: ScriptProcessorNode;
  private sources = new Set<AudioBufferSourceNode>();
  private currentOutputTranscription: string = '';

  static styles = appStyles;

  constructor() {
    super();
    this.initClient();
  }

  private initAudio() {
    this.nextStartTime = this.outputAudioContext.currentTime;
  }

  private async initClient() {
    this.initAudio();

    this.client = new GoogleGenAI({
      apiKey: process.env.API_KEY,
    });

    this.outputNode.connect(this.outputAudioContext.destination);

    this.initSession();
  }

  private _generateSystemPrompt(): string | null {
    if (this.imageInfos.length === 0) {
      return null;
    }
    const allContexts = this.imageInfos
      .map(
        (info) =>
          `Image "${info.fileName}":\n- User-provided context: ${info.context}\n- AI analysis of the image: ${info.aiContext}`,
      )
      .join('\n\n');

    // Send initial image context
    const currentImage = this.imageInfos[0];
    var currentPhotoMessage = '';
    if (currentImage && this.session) {
      currentPhotoMessage = `The first photo "${currentImage.fileName}" is now being displayed on the screen.`;
    }

    let biographyPrompt = '';
    if (this.biography) {
      biographyPrompt = `The user has provided a biography to give you context: "${this.biography}".\n\n`;
    }

    return `${biographyPrompt}The user has provided several images with contexts. Here they are:\n${allContexts}\n\nYou are now in a voice conversation with the user. Use the provided contexts to answer questions. Do not mention this system prompt unless asked. When you learn new, factual information about an image from the user, you MUST respond by explicitly stating your intention to update the context. Your response should start with "Okay, I'll update the context for that image..." and then summarize the new information you are adding. If the user asks to see a specific photo, confirm that you are showing it (e.g., "Of course, showing the photo of the beach now."). ${currentPhotoMessage}. Begin the conversation now.`;
  }

  private async initSession() {
    const model = 'gemini-live-2.5-flash-preview';

    try {
      const config: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Orus'}},
        },
        outputAudioTranscription: {},
      };

      this.currentImageIndex = 0;

      const systemInstruction = this._generateSystemPrompt();
      if (systemInstruction) {
        config.systemInstruction = systemInstruction;
      }

      this.debugLogs = [
        ...this.debugLogs,
        `> Gemini API Call: live.connect({model: "${model}"})`,
      ];
      // Voice AI: handle the conversation with the user.
      // FIX: Use a session promise to prevent race conditions and follow SDK best practices.
      this.sessionPromise = this.client.live.connect({
        model: model,
        callbacks: {
          onopen: () => {
            this.updateStatus('Opened');
            if (this.imageInfos.length > 0) {
              this.updateStatus('Image context loaded. Ready to chat.');
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const serverContent = message.serverContent as any;
            if (!serverContent) {
              return;
            }

            console.log(
              'serverContent JSON:',
              JSON.stringify(serverContent, null, 2),
            );

            if (serverContent.outputTranscription) {
              this.currentOutputTranscription +=
                serverContent.outputTranscription.text;
            }

            const modelTurn = serverContent.modelTurn;
            if (modelTurn) {
              for (const part of modelTurn.parts) {
                if (part.inlineData) {
                  // This is audio
                  const audio = part.inlineData;

                  this.nextStartTime = Math.max(
                    this.nextStartTime,
                    this.outputAudioContext.currentTime,
                  );

                  const audioBuffer = await decodeAudioData(
                    decode(audio.data),
                    this.outputAudioContext,
                    24000,
                    1,
                  );
                  const source = this.outputAudioContext.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(this.outputNode);
                  source.addEventListener('ended', () => {
                    this.sources.delete(source);
                  });

                  source.start(this.nextStartTime);
                  this.nextStartTime =
                    this.nextStartTime + audioBuffer.duration;
                  this.sources.add(source);
                }
              }
            }

            if (serverContent.turnComplete) {
              console.log(
                'this.currentOutputTranscription: ' +
                  this.currentOutputTranscription,
              );

              this.updateContextWithAI(this.currentOutputTranscription);

              this.currentOutputTranscription = '';
            }

            if (serverContent.interrupted) {
              for (const source of this.sources.values()) {
                source.stop();
                this.sources.delete(source);
              }
              this.nextStartTime = 0;
              this.currentOutputTranscription = '';
            }
          },
          onerror: (e: ErrorEvent) => {
            this.updateError(e.message);
          },
          onclose: (e: CloseEvent) => {
            this.updateStatus('Close:' + e.reason);
          },
        },
        config: config,
      });
      this.session = await this.sessionPromise;
    } catch (e) {
      console.error(e);
      this.updateError((e as Error).message);
    }
  }

  private updateStatus(msg: string) {
    this.status = msg;
  }

  private updateError(msg: string) {
    this.error = msg;
  }

  private async startRecording() {
    if (this.isRecording) {
      return;
    }

    this.inputAudioContext.resume();

    this.updateStatus('Requesting microphone access...');

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.updateStatus('Microphone access granted. Starting capture...');

      this.sourceNode = this.inputAudioContext.createMediaStreamSource(
        this.mediaStream,
      );
      this.sourceNode.connect(this.inputNode);

      const bufferSize = 4096;
      this.scriptProcessorNode = this.inputAudioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      this.scriptProcessorNode.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;

        const inputBuffer = audioProcessingEvent.inputBuffer;
        const pcmData = inputBuffer.getChannelData(0);

        // Do not send empty audio chunks.
        if (pcmData.length === 0) {
          return;
        }

        const blob = createBlob(pcmData);
        // If blob creation results in empty data, do not send.
        if (!blob.data) {
          return;
        }

        this.sessionPromise.then((session) => {
          session.sendRealtimeInput({media: blob});
        });
      };

      this.sourceNode.connect(this.scriptProcessorNode);
      this.scriptProcessorNode.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.updateStatus('🔴 Recording... Capturing PCM chunks.');
    } catch (err) {
      console.error('Error starting recording:', err);
      this.updateStatus(`Error: ${(err as Error).message}`);
      this.stopRecording();
    }
  }

  private stopRecording() {
    if (!this.isRecording && !this.mediaStream && !this.inputAudioContext)
      return;

    this.updateStatus('Stopping recording...');

    this.isRecording = false;

    if (this.scriptProcessorNode && this.sourceNode && this.inputAudioContext) {
      this.scriptProcessorNode.disconnect();
      this.sourceNode.disconnect();
    }

    this.scriptProcessorNode = null;
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.updateStatus('Recording stopped. Click Start to begin again.');
  }

  private reset() {
    this.session?.close();
    this.initSession();
    this.updateStatus('Session cleared.');
  }

  private async handleImageUpload(e: Event) {
    // Support both input and drag-and-drop events
    const files: FileList | null =
      (e instanceof DragEvent
        ? e.dataTransfer?.files
        : (e.target as HTMLInputElement)?.files) ?? null;
    const inputElem: HTMLInputElement | null =
      e && !(e instanceof DragEvent) && (e.target as HTMLInputElement)?.files
        ? (e.target as HTMLInputElement)
        : null;

    if (!files || files.length === 0) return;

    this.isProcessingFiles = true;
    this.imageError = '';
    this.imageInfos = [];
    this.isContextApplied = false;

    const fileList = Array.from(files);
    const jsonFiles = fileList.filter((f) => f.type === 'application/json' || f.name.toLowerCase().endsWith('.json'));
    const imageFiles = fileList.filter((f) => f.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      this.imageError = 'Error: No image files found.';
      this.isProcessingFiles = false;
      if (inputElem) {
        inputElem.value = ''; // Clear the file input value
      }
      return;
    }

    let contextData: {
        biography: string;
        photos: {fileName: string; context: string}[];
    } = {biography: '', photos: []};

    const contextFile = jsonFiles.length > 0 ? jsonFiles[0] : null;
    if (contextFile) {
      try {
        const contextJson = await contextFile.text();
        const parsedData = JSON.parse(contextJson);
        contextData.biography = parsedData.biography || '';
        contextData.photos =
          parsedData.photos && Array.isArray(parsedData.photos)
            ? parsedData.photos
            : [];
      } catch (err) {
        this.imageError = `Warning: Could not parse context.json. Proceeding without context. Error: ${
          (err as Error).message
        }`;
        console.error('Error parsing context.json:', err);
      }
    }

    try {
      this.biography = contextData.biography;
      const contexts = contextData.photos;

      const fileReadPromises = imageFiles.map((file) => {
        return new Promise<ImageInfo>((resolve, reject) => {
          const contextEntry = contexts.find((c) => c.fileName === file.name);

          const reader = new FileReader();
          reader.onloadend = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve({
              fileName: file.name,
              mimeType: file.type,
              base64: base64String,
              context: contextEntry?.context || '', // Default to empty string
              aiContext: 'loading...',
              url: URL.createObjectURL(file),
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const readImageInfos = await Promise.all(fileReadPromises);
      this.imageInfos = readImageInfos;
      this.isProcessingFiles = false; // Initial file processing is done

      // Asynchronously analyze images and update UI for each
      readImageInfos.forEach(async (info, index) => {
        try {
          this.debugLogs = [
            ...this.debugLogs,
            `> Gemini API Call: models.generateContent({model: "gemini-2.5-flash", contents: Image Analysis for ${info.fileName}})`,
          ];
          const analysisResponse = await this.client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
              parts: [
                {
                  text: 'Analyze and describe this image in a single, concise sentence for extra context in a voice conversation.',
                },
                {
                  inlineData: {
                    mimeType: info.mimeType,
                    data: info.base64,
                  },
                },
              ],
            },
          });

          const newImageInfos = [...this.imageInfos];
          newImageInfos[index] = {
            ...newImageInfos[index],
            aiContext: analysisResponse.text,
          };
          this.imageInfos = newImageInfos;
        } catch (err) {
          console.error(`Failed to analyze image ${info.fileName}:`, err);
          const newImageInfos = [...this.imageInfos];
          newImageInfos[index] = {
            ...newImageInfos[index],
            aiContext: 'Error: AI analysis failed for this image.',
          };
          this.imageInfos = newImageInfos;
        }
      });
    } catch (err) {
      console.error('Error processing files:', err);
      this.imageError = `Error processing files: ${(err as Error).message}`;
      this.isProcessingFiles = false;
    } finally {
      // Also clear the file input value so user can upload the same files again
      if (inputElem) inputElem.value = '';
    }
  }

  private updateVoiceContext() {
    this.reset();
    this.isContextApplied = true;
    this.applyContextMessage = ''; // Clear message on apply
  }

  private clearImageContext() {
    this.imageInfos = [];
    this.imagePrompt = '';
    this.imageResponse = '';
    this.imageError = '';
    this.isContextApplied = false;
    this.currentImageIndex = 0;
    this.biography = '';
    this.applyContextMessage = ''; // Clear message on clear
    this.reset();
    this.updateStatus('Image context cleared.');
  }

  private handlePromptInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    this.imagePrompt = target.value;
  }

  private changeSlide() {
    if (this.imageInfos.length <= 1) return;

    const newIndex = (this.currentImageIndex + 1) % this.imageInfos.length;
    this.currentImageIndex = newIndex;

    const currentImage = this.imageInfos[this.currentImageIndex];
    if (currentImage && this.session) {
      const message = `The photo "${currentImage.fileName}" is now being displayed on the screen.`;
      console.log(`Sending to AI: ${message}`);
      this.updateStatus(message);
      this.sessionPromise.then((session) => {
        session.sendClientContent({turns: message});
      });
    }
  }

  private async handleSubmit() {
    if (
      this.imageInfos.length === 0 ||
      !this.imagePrompt ||
      this.isAnsweringQuestion
    ) {
      return;
    }
    this.isAnsweringQuestion = true;
    this.imageResponse = '';
    this.imageError = '';

    try {
      // Construct parts array
      const parts: any[] = [];

      // Initial instruction
      parts.push({
        text: "You are an AI assistant. Use the following images and their provided contexts (both from the user and from a previous AI analysis) to answer the user's question.",
      });

      // Add each image and its context
      for (const info of this.imageInfos) {
        parts.push({
          text: `Context for image "${info.fileName}":\n- User-provided context: ${info.context}\n- AI analysis of the image: ${info.aiContext}`,
        });
        parts.push({
          inlineData: {
            mimeType: info.mimeType,
            data: info.base64,
          },
        });
      }

      // Add the user's question
      parts.push({text: `User's question: ${this.imagePrompt}`});

      this.debugLogs = [
        ...this.debugLogs,
        `> Gemini API Call: models.generateContent({model: "gemini-2.5-flash", contents: Text Question "${this.imagePrompt}"})`,
      ];
      const response: GenerateContentResponse =
        await this.client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: {parts: parts},
        });

      this.imageResponse = response.text;
    } catch (e) {
      console.error(e);
      this.imageError = (e as Error).message;
    } finally {
      this.isAnsweringQuestion = false;
    }
  }

  private showImage(fileName: string) {
    const imageIndex = this.imageInfos.findIndex(
      (info) => info.fileName === fileName,
    );

    // Only proceed if the image exists.
    if (imageIndex > -1) {
      // If it's not already the first image, move it to the front.
      if (imageIndex !== 0) {
        const newImageInfos = [...this.imageInfos];
        const [imageToShow] = newImageInfos.splice(imageIndex, 1);
        newImageInfos.unshift(imageToShow);
        this.imageInfos = newImageInfos;
      }

      // Set the view to the first image (which is now the requested one).
      this.currentImageIndex = 0;

      const message = `The photo "${fileName}" is now being displayed on the screen.`;
      console.log(`Sending to main AI: ${message}`);
      this.updateStatus(message);
      this.sessionPromise.then((session) => {
        session.sendClientContent({turns: message});
      });

      this.updateStatus(`Switched to photo: ${this.formatFileName(fileName)}`);
    } else {
      console.warn(`Could not find image to show: ${fileName}`);
    }
  }

  private updateLocalImageContext(fileName: string, newContext: string) {
    const imageIndex = this.imageInfos.findIndex(
      (info) => info.fileName === fileName,
    );
    if (imageIndex > -1) {
      const newImageInfos = [...this.imageInfos];
      newImageInfos[imageIndex] = {
        ...newImageInfos[imageIndex],
        context: newContext,
      };
      this.imageInfos = newImageInfos;
      this.isContextApplied = false; // Mark context as changed, needs re-application
      console.log(`Context for ${fileName} updated successfully.`);
      this.debugLogs = [
        ...this.debugLogs,
        `> Context updated for ${fileName}: "${newContext}"`,
      ];
      this.applyContextMessage = `Context for ${fileName} was updated by AI. Apply context to use it in voice chat.`;
      this.updateStatus(`Context for ${fileName} updated.`);
    }
  }

  private async updateContextWithAI(modelText: string) {
    if (this.imageInfos.length === 0) {
      return; // No images to update context for
    }

    const currentImage = this.imageInfos[this.currentImageIndex];
    if (!currentImage) return;

    const tool = {
      functionDeclarations: [
        {
          name: 'updateImageContext',
          description:
            'Updates the user-provided context for a specific image file.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fileName: {
                type: Type.STRING,
                description: 'The file name of the image to update.',
              },
              newContext: {
                type: Type.STRING,
                description:
                  'The new, updated context for the image, incorporating information from the conversation.',
              },
            },
            required: ['fileName', 'newContext'],
          },
        },
        {
          name: 'showImage',
          description:
            'Displays a specific image on the screen by its file name in response to a user request.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              fileName: {
                type: Type.STRING,
                description: 'The file name of the image to display.',
              },
            },
            required: ['fileName'],
          },
        },
      ],
    };

    const availableImageFileNames = JSON.stringify(
      this.imageInfos.map((info) => info.fileName),
    );
    const systemInstruction = `You are a function-calling AI that analyzes text to determine if an action should be taken. You have two functions available: 'updateImageContext' and 'showImage'.

1.  **'updateImageContext'**: Call this function if the input text explicitly states that context for an image will be updated. The text will typically start with "Okay, I'll update the context...".
    *   \`fileName\`: Use the file name of the image currently being discussed, which is "${currentImage.fileName}".
    *   \`newContext\`: Extract the new, updated context from the input text. The existing context is: "${currentImage.context}".

2.  **'showImage'**: Call this function if the input text indicates a request to show a specific photo (e.g., "Sure, here is the photo of the sunset.").
    *   \`fileName\`: From the list of available images, choose the file name that best matches the description in the input text.
    *   Available image files: ${availableImageFileNames}.

Analyze the input text and call the appropriate function with the correct arguments if an action is indicated. If not, do not call any function.`;

    try {
      this.debugLogs = [
        ...this.debugLogs,
        `> Gemini API Call: models.generateContent({model: "gemini-2.5-flash", contents: Context Update Check for "${currentImage.fileName}"})`,
      ];
      // Context handling AI: update the context when necessary
      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: modelText,
        config: {
          systemInstruction: systemInstruction,
          tools: [tool],
        },
      });

      const calls = response.functionCalls;

      if (calls) {
        for (const call of calls) {
          if (call.name === 'updateImageContext') {
            const {fileName, newContext} = call.args;
            console.log(
              `AI wants to update context for ${fileName} to: ${newContext}`,
            );
            this.debugLogs = [
              ...this.debugLogs,
              `> updateImageContext called for ${fileName} with newContext: "${newContext}"`,
            ];

            // FIX: Argument of type 'unknown' is not assignable to parameter of type 'string'. Cast to String.
            this.updateLocalImageContext(String(fileName), String(newContext));
          } else if (call.name === 'showImage') {
            const {fileName} = call.args;
            console.log(`AI wants to show image: ${fileName}`);
            this.showImage(String(fileName));
          }
        }
      }
    } catch (e) {
      console.error('Context updater AI failed:', e);
    }
  }

  private formatFileName(fileName: string): string {
    if (!fileName) return '';
    const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
    return (
      nameWithoutExtension.charAt(0).toUpperCase() +
      nameWithoutExtension.slice(1)
    );
  }

  render() {
    return html`
      <div class="tabs">
        <button
          class=${this.activeTab === 'audio' ? 'active' : ''}
          @click=${() => (this.activeTab = 'audio')}>
          Slide Show
        </button>
        <button
          class=${this.activeTab === 'image' ? 'active' : ''}
          @click=${() => (this.activeTab = 'image')}>
          Upload Images
        </button>
      </div>
      <div class="tab-content">
        ${this.activeTab === 'audio' ? this.renderAudio() : this.renderImage()}
      </div>
    `;
  }

  renderAudio() {
    const hasImages = this.imageInfos.length > 0;
    const currentImage = hasImages
      ? this.imageInfos[this.currentImageIndex]
      : null;

    return html`
      <div class="audio-view">
        <gdm-live-audio-visuals-3d
          .inputNode=${this.inputNode}
          .outputNode=${this.outputNode}></gdm-live-audio-visuals-3d>
        ${this.imageInfos.length > 0
          ? html`
              <div class="context-info">
                <span>Click the image to switch.</span>
                <button
                  class="clear-context-button"
                  @click=${this.clearImageContext}>
                  Clear Images
                </button>
              </div>
            `
          : ''}
        <div class="controls">
          <button
            id="resetButton"
            @click=${this.reset}
            ?disabled=${this.isRecording}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="40px"
              viewBox="0 -960 960 960"
              width="40px"
              fill="#ffffff">
              <path
                d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z" />
            </svg>
          </button>
          <button
            id="startButton"
            @click=${this.startRecording}
            ?disabled=${this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#c80000"
              xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="50" />
            </svg>
          </button>
          <button
            id="stopButton"
            @click=${this.stopRecording}
            ?disabled=${!this.isRecording}>
            <svg
              viewBox="0 0 100 100"
              width="32px"
              height="32px"
              fill="#000000"
              xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="0" width="100" height="100" rx="15" />
            </svg>
          </button>
        </div>

        <div id="status"> ${this.error || this.status} </div>

        ${hasImages && currentImage
          ? html`
              <div class="slideshow-container" @click=${this.changeSlide}>
                <img
                  src=${currentImage.url}
                  alt=${currentImage.fileName}
                  class="slideshow-image" />
              </div>
              <div class="context-frame">
                <button
                  class="gear-button"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    this.showContext = !this.showContext;
                  }}>
                  <span>&lt;/&gt;</span>
                </button>
                ${this.showContext
                  ? html`
                      <div class="context-content-visible">
                        <div class="context-filename">
                          ${this.formatFileName(currentImage.fileName)}
                        </div>
                        ${currentImage.context
                          ? html`<p>
                              <strong>User:</strong> ${currentImage.context}
                            </p>`
                          : ''}
                        <p>
                          <strong>AI:</strong>
                          ${currentImage.aiContext === 'loading...'
                            ? html`<span class="loader-small"></span>`
                            : ` ${currentImage.aiContext}`}
                        </p>
                        ${this.debugLogs.length > 0
                          ? html`
                              <div
                                style="width:100%; height:1px; background: rgba(255,255,255,0.1); margin: 10px 0;"></div>
                              <p style="font-weight: bold;">Debug Logs:</p>
                              ${this.debugLogs.map(
                                (log) =>
                                  html`<p style="padding-left: 10px;">
                                    ${log}
                                  </p>`,
                              )}
                            `
                          : ''}
                      </div>
                    `
                  : ''}
              </div>
            `
          : ''}
      </div>
    `;
  }

  renderImage() {
    return html`
      <div class="image-view">
        <input
          type="file"
          id="image-upload"
          accept="image/*,application/json"
          @change=${this.handleImageUpload}
          multiple />
        <label
          for="image-upload"
          class="image-container"
          @dragover=${(e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          @drop=${(e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
              // Create a fake event to reuse handleImageUpload
              const input = this.renderRoot.querySelector('#image-upload') as HTMLInputElement;
              if (input) {
                // Create a DataTransfer to set files on input (not possible directly), so call handler directly
                // Instead, call the handler with a custom event
                const event = { target: { files } } as unknown as Event;
                this.handleImageUpload(event);
              }
            }
          }}
        >
          ${this.isProcessingFiles
            ? html`<div>
                <div class="loader"></div>
                <p>Processing and analyzing files...</p>
              </div>`
            : this.imageInfos.length > 0
              ? html`<div class="image-gallery">
                  ${this.imageInfos.map(
                    (info) => html`
                      <div class="gallery-item">
                        <img src=${info.url} alt=${info.fileName} />
                        <p>${this.formatFileName(info.fileName)}</p>
                      </div>
                    `,
                  )}
                </div>`
              : html`<p>
                  Click or drop images here.<br />(context.json is optional)
                </p>`}
        </label>

        ${this.imageInfos.length > 0
          ? html`
              <div class="form-container">
                <div class="context-display">
                  <h4>Uploaded Contexts:</h4>
                  ${this.imageInfos.map(
                    (info) => html`
                      <div class="context-item">
                        <strong>${this.formatFileName(info.fileName)}</strong>
                        ${info.context
                          ? html`<p class="user-context">
                              <em>User:</em> ${info.context}
                            </p>`
                          : ''}
                        <p class="ai-context">
                          <em>AI:</em>
                          ${info.aiContext === 'loading...'
                            ? html`<span class="loader-small"></span>`
                            : ` ${info.aiContext}`}
                        </p>
                      </div>
                    `,
                  )}
                </div>

                ${this.applyContextMessage
                  ? html`<p class="apply-context-message">
                      ${this.applyContextMessage}
                    </p>`
                  : ''}
                <button
                  class="submit-button"
                  @click=${this.updateVoiceContext}
                  ?disabled=${this.isContextApplied}>
                  ${this.isContextApplied
                    ? '✅ Context Applied to Voice'
                    : 'Apply Context to Voice AI'}
                </button>

                <div
                  style="width:100%; height:1px; background: rgba(255,255,255,0.1); margin: 10px 0;"></div>

                <label
                  for="image-prompt-input"
                  style="font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: -5px;">
                  Ask a Question (Text only)
                </label>
                <textarea
                  id="image-prompt-input"
                  placeholder="Ask a question about the images..."
                  .value=${this.imagePrompt}
                  @input=${this.handlePromptInput}
                  ?disabled=${this.isAnsweringQuestion}></textarea>
                <button
                  class="submit-button"
                  @click=${this.handleSubmit}
                  ?disabled=${!this.imagePrompt || this.isAnsweringQuestion}>
                  ${this.isAnsweringQuestion
                    ? html`<div class="loader"></div>`
                    : 'Ask AI'}
                </button>
              </div>
            `
          : ''}
        ${this.imageError ? html`<p class="error">${this.imageError}</p>` : ''}
        ${this.imageResponse
          ? html` <div class="response-container">${this.imageResponse}</div> `
          : ''}
      </div>
    `;
  }
}
