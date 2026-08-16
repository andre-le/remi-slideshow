import { GoogleGenAI } from "@google/genai";

export interface ImageInfo {
  fileName: string;
  mimeType: string;
  base64: string;
  context: string;
  aiContext: string;
  url: string;
}

/**
 * Analyzes an image using Gemini to provide a concise description.
 */
export async function analyzeImage(client: GoogleGenAI, mimeType: string, base64: string): Promise<string> {
  try {
    const analysisResponse = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            text: 'Analyze and describe this image in a single, concise sentence for extra context in a voice conversation.',
          },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64,
            },
          },
        ],
      },
    });
    return analysisResponse.text || 'Error: AI analysis failed for this image.';
  } catch (err) {
    console.error('Image analysis failed:', err);
    return 'Error: AI analysis failed for this image.';
  }
}

/**
 * Converts a File object to a base64 string.
 */
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Fetches a URL and converts it to a base64 string and mimeType.
 */
export async function urlToBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ base64: base64String, mimeType: blob.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
