import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';

/**
 * Definition for a function calling evaluation scenario.
 */
export interface EvalToolQuestion {
  id: string;
  question: string;
  category: string;
  expectedTool: 'showImage' | 'updateImageContext';
  expectedFileName: string;
  currentPhotoFileName: string;
  expectedKeywords?: string[];
}

/**
 * Metadata for photos passed to the tool verifier.
 */
export interface PhotoContextCatalogEntry {
  fileName: string;
  context: string;
  aiContext?: string;
}

/**
 * Detailed diagnostic result of tool call verification.
 */
export interface ToolVerificationResult {
  isPass: boolean;
  toolCalled: 'showImage' | 'updateImageContext' | null;
  calledArgs: Record<string, any>;
  expectedTool: 'showImage' | 'updateImageContext';
  expectedFileName: string;
  gradeReason: string;
}

/**
 * Input parameters for verifying tool triggering from spoken text.
 */
export interface ToolEvalParams {
  spokenText: string;
  userPrompt: string;
  currentPhotoFileName: string;
  currentContext: string;
  availablePhotos: PhotoContextCatalogEntry[];
  expectedTool: 'showImage' | 'updateImageContext';
  expectedFileName: string;
  expectedKeywords?: string[];
}

/**
 * ToolCallVerifier
 *
 * Verifies that Voice AI spoken responses correctly trigger downstream
 * client tool calls (`showImage` and `updateImageContext`) with matching arguments.
 */
export class ToolCallVerifier {
  private client: GoogleGenAI;
  private modelName: string;

  constructor(client: GoogleGenAI, modelName = 'gemini-3.7-flash') {
    this.client = client;
    this.modelName = modelName;
  }

  /**
   * Analyzes the spoken text of the Voice AI using function calling declarations
   * to determine if the expected tool was invoked with correct arguments.
   */
  async evaluateToolCall(params: ToolEvalParams): Promise<ToolVerificationResult> {
    const updateImageContextDecl: FunctionDeclaration = {
      name: 'updateImageContext',
      description: 'Updates the user-provided context for a specific image file.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          fileName: {
            type: Type.STRING,
            description: 'The exact file name of the image to update.',
          },
          newContext: {
            type: Type.STRING,
            description: 'The new, updated context for the image incorporating information from the conversation.',
          },
        },
        required: ['fileName', 'newContext'],
      },
    };

    const showImageDecl: FunctionDeclaration = {
      name: 'showImage',
      description: 'Displays a specific image on the screen by its file name in response to a user request.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          fileName: {
            type: Type.STRING,
            description: 'The exact file name of the image to display.',
          },
        },
        required: ['fileName'],
      },
    };

    const catalogDescription = params.availablePhotos
      .map((p) => `- File: "${p.fileName}" | User Context: ${p.context} | Visuals: ${p.aiContext || 'N/A'}`)
      .join('\n');

    const systemInstruction = `You are a function-calling agent that analyzes conversational text in a slideshow app to trigger actions. You have two functions available: 'updateImageContext' and 'showImage'.

AVAILABLE IMAGES CATALOG:
${catalogDescription}

INSTRUCTIONS:
1. 'updateImageContext': Call this function if the conversational text indicates that context for an image is being updated, corrected, or added (e.g. starts with "Okay, I'll update the context..." or states an update).
   * fileName: The file name of the image being updated (current active photo is "${params.currentPhotoFileName}").
   * newContext: The new, updated context incorporating the new facts. Existing context: "${params.currentContext}".

2. 'showImage': Call this function if the conversational text confirms or requests showing/displaying a specific photo (e.g. "Sure, showing the photo of...", "Here is the photo of...").
   * fileName: Choose the exact file name from the Available Images Catalog that matches the photo description.

Analyze the input text carefully and call the appropriate function with exact arguments. If no photo action is indicated, do not call any function.`;

    try {
      const inputText = `User Request: "${params.userPrompt}"\nSpoken Assistant Response: "${params.spokenText}"`;

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: inputText,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: [updateImageContextDecl, showImageDecl] }],
        },
      });

      const calls = response.functionCalls;
      if (!calls || calls.length === 0) {
        return {
          isPass: false,
          toolCalled: null,
          calledArgs: {},
          expectedTool: params.expectedTool,
          expectedFileName: params.expectedFileName,
          gradeReason: `No function call triggered. Model spoke: "${params.spokenText}". Expected tool '${params.expectedTool}' was not invoked.`,
        };
      }

      const firstCall = calls[0];
      const toolName = firstCall.name as 'showImage' | 'updateImageContext';
      const args = (firstCall.args as Record<string, any>) || {};

      // Grade showImage
      if (params.expectedTool === 'showImage') {
        if (toolName !== 'showImage') {
          return {
            isPass: false,
            toolCalled: toolName,
            calledArgs: args,
            expectedTool: params.expectedTool,
            expectedFileName: params.expectedFileName,
            gradeReason: `Incorrect tool invoked: called '${toolName}' instead of 'showImage'.`,
          };
        }

        const calledFile = String(args.fileName || '').trim();
        const matchesFile = calledFile.toLowerCase() === params.expectedFileName.toLowerCase();

        return {
          isPass: matchesFile,
          toolCalled: 'showImage',
          calledArgs: args,
          expectedTool: params.expectedTool,
          expectedFileName: params.expectedFileName,
          gradeReason: matchesFile
            ? `Successfully triggered 'showImage' with target file "${calledFile}".`
            : `Triggered 'showImage' with incorrect file "${calledFile}" (expected "${params.expectedFileName}").`,
        };
      }

      // Grade updateImageContext
      if (params.expectedTool === 'updateImageContext') {
        if (toolName !== 'updateImageContext') {
          return {
            isPass: false,
            toolCalled: toolName,
            calledArgs: args,
            expectedTool: params.expectedTool,
            expectedFileName: params.expectedFileName,
            gradeReason: `Incorrect tool invoked: called '${toolName}' instead of 'updateImageContext'.`,
          };
        }

        const calledFile = String(args.fileName || '').trim();
        const newContext = String(args.newContext || '');
        const matchesFile = calledFile.toLowerCase() === params.expectedFileName.toLowerCase();

        const missingKeywords = (params.expectedKeywords || []).filter(
          (kw) => !newContext.toLowerCase().includes(kw.toLowerCase())
        );

        const isPass = matchesFile && missingKeywords.length === 0;
        let gradeReason = '';
        if (!matchesFile) {
          gradeReason = `Triggered 'updateImageContext' on wrong file "${calledFile}" (expected "${params.expectedFileName}").`;
        } else if (missingKeywords.length > 0) {
          gradeReason = `Triggered 'updateImageContext' on "${calledFile}", but newContext omitted expected info: ${missingKeywords.join(', ')}.`;
        } else {
          gradeReason = `Successfully triggered 'updateImageContext' on "${calledFile}" with updated facts: "${newContext}".`;
        }

        return {
          isPass,
          toolCalled: 'updateImageContext',
          calledArgs: args,
          expectedTool: params.expectedTool,
          expectedFileName: params.expectedFileName,
          gradeReason,
        };
      }

      return {
        isPass: false,
        toolCalled: toolName,
        calledArgs: args,
        expectedTool: params.expectedTool,
        expectedFileName: params.expectedFileName,
        gradeReason: `Unhandled tool evaluation for '${params.expectedTool}'.`,
      };
    } catch (err) {
      console.error('ToolCallVerifier error:', err);
      return {
        isPass: false,
        toolCalled: null,
        calledArgs: {},
        expectedTool: params.expectedTool,
        expectedFileName: params.expectedFileName,
        gradeReason: `Tool verification failed with error: ${(err as Error).message}`,
      };
    }
  }
}
