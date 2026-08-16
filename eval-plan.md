# Voice AI Evaluation Plan & Architecture

## Overview
This document outlines the current state, architecture, key limitations, and future improvement roadmap for the Voice AI Evaluation suite (`eval.tsx`) within the slideshow application.

---

## 1. Current State & Architecture

The evaluation harness operates as an automated testing module embedded as an interactive overlay panel (accessed via the 📊 button in the UI).

```
[context.json + Images]
       ↓
[Gemini 2.5 Flash Vision] → Generates visual context (aiContext) for each photo
       ↓
[liveAgent: generateSystemPrompt] → Assembles system instructions (biography + photo metadata)
       ↓
[Gemini Live Session (gemini-2.5-flash-native-audio-preview-09-2025)] → Establishes real-time connection
       ↓
[Sequential Benchmark Queries] → Dispatches text turns via sendClientContent
       ↓
[outputTranscription & turnComplete] → Captures and displays spoken response transcripts
```

### Execution Flow:
1. **Context & Ingestion**: Reads `public/eval_input/context.json` (containing synthetic persona Clara Sterling's biography and photo metadata) along with 4 AI-generated evaluation images.
2. **Multimodal Enrichment**: Pre-processes each image with `analyzeImage()` (`gemini-2.5-flash` in `imageAnalyzerAgent.tsx`) to generate 1-sentence visual descriptions (`aiContext`).
3. **Prompt Construction**: Uses `generateSystemPrompt()` (`liveAgent.tsx`) to build the exact system instructions used in production.
4. **Live Session Setup**: Initializes a real-time session with `gemini-2.5-flash-native-audio-preview-09-2025` using `AUDIO` response modality and audio transcription enabled.
5. **Sequential Benchmark Queries**: Sends 5 benchmark questions via text turns:
   - *"Who is Clara Sterling and where does she live?"*
   - *"When did Clara and Arthur get married?"*
   - *"Who are Clara's daughters and where do they live?"*
   - *"Tell me about the photo of Arthur in the backyard garden."*
   - *"What trip is shown in the mountain hiking photo?"*
6. **Transcript Capture**: Aggregates `outputTranscription.text` streams until `turnComplete` and logs/renders the output.

---

## 2. Key Differences from Production

| Dimension | Production App (`index.tsx`) | Current Eval (`eval.tsx`) |
| :--- | :--- | :--- |
| **Input Modality** | Streaming microphone PCM audio chunks (`sendRealtimeInput`) | Text queries (`sendClientContent`) |
| **Tool / Function Calling** | Tests `showImage` and `updateImageContext` tool calls | Does not verify tool calls |
| **Scoring / Evaluation** | Interactive human conversation | Manual visual inspection of transcripts |
| **Test Coverage** | Open conversational range | 5 hardcoded questions against 1 persona |

---

## 3. Future Improvement Roadmap

### Milestone 1: Automated "LLM-as-a-Judge" Scoring & Ground Truth
- **Ground Truth Definition**: Extend `context.json` with an `evalQuestions` suite pairing questions with `expected_facts`, `category`, and `acceptable_variations`.
- **Automated Grading Engine**: Run a fast secondary grading prompt on `gemini-2.5-flash` evaluating:
  - **Factuality & Accuracy** (Pass / Fail or 1–5 numerical score)
  - **Hallucination Detection** (flagging ungrounded names, dates, or relationships)
  - **Persona & Empathy** (warmth, tone, appropriate conversational brevity)
- **Summary Metrics**: Display aggregate pass rates (% factual, hallucination rate, average latency).

### Milestone 2: Function Calling & Photo Navigation Verification
- **Tool Triggering Tests**: Test whether intent prompts (e.g., *"Show me the wedding photo"* or *"Can you show the picture in Hawaii?"*) trigger `showImage` with the correct filename argument (`20190827_195553.jpg`, `IMG_1662.jpg`).
- **Context Update Verification**: Test whether correcting information (e.g., *"Actually, the person next to Bob in that running photo is his friend Dave"*) correctly invokes `updateImageContext`.

### Milestone 3: Categorical Benchmark Matrix
Expand beyond the 5 basic questions into specific test suites:
- **Biographical Recall**: Precise dates, locations, family tree relationships.
- **Visual Question Answering (VQA)**: Visual details within the images (e.g., *"What costume is Bob wearing in the Christmas run photo?"*).
- **Temporal & Relational Reasoning**: Multi-hop relationships (e.g., *"Who are Martha's twin grandsons?"*, *"Where does her youngest daughter live?"*).
- **Negative / Out-of-Bounds Tests**: Queries about unknown facts to ensure the AI admits uncertainty rather than hallucinating.

### Milestone 4: Latency & Performance Benchmarking
- **Time to First Transcript Chunk (TTFT / TTFA)**: Benchmark response start latency.
- **Total Turn Completion Time**: Measure total speaking and processing duration.
- **Regression Tracking**: Compare latency and token metrics across different system prompt configurations.

### Milestone 5: Exporting & Continuous Evaluation
- **JSON / CSV Export**: Enable downloading full evaluation reports with timestamps, questions, transcripts, and model grading.
- **Side-by-Side Comparisons**: Enable running evaluations across different model variants (e.g., Gemini 2.5 Flash vs. Gemini 2.5 Pro) or prompt revisions.
