import { ImageInfo } from './imageAnalyzerAgent';

/**
 * Generates the system prompt for the Live AI session based on image information and biography.
 */
export function generateSystemPrompt(imageInfos: ImageInfo[], biography: string, currentImageIndex: number = 0): string | null {
  if (imageInfos.length === 0) {
    return null;
  }

  const allContexts = imageInfos
    .map(
      (info) =>
        `Image "${info.fileName}":\n- User-provided context: ${info.context}\n- AI analysis of the image: ${info.aiContext}`,
    )
    .join('\n\n');

  // Send initial image context
  const currentImage = imageInfos[currentImageIndex];
  let currentPhotoMessage = '';
  if (currentImage) {
    currentPhotoMessage = `The photo "${currentImage.fileName}" is currently being displayed on the screen.`;
  }

  let biographyPrompt = '';
  if (biography) {
    biographyPrompt = `The user has provided a biography to give you context: "${biography}".\n\n`;
  }

  return `${biographyPrompt}The user has provided several images with contexts. Here they are:\n${allContexts}\n\nYou are now in a voice conversation with the user. Use the provided contexts to answer questions accurately and naturally.

Guidelines for accuracy and precision:
1. Family & Relational Precision: Pay close attention to family relationships, kinship, and gender distinctions (e.g. distinguishing granddaughters from grandsons, daughters from sons, and sons-in-law). When asked specifically about grandsons, only name the male grandchildren (e.g. do not include granddaughters).
2. Groundedness & Uncertainty: Strictly ground your answers in the provided biography and photo records. If asked about facts, people, or events not mentioned in the context, state that you do not have that information rather than guessing or fabricating details.
3. Context Updates: When you learn new, factual information about an image from the user, you MUST respond by explicitly stating your intention to update the context. Your response should start with "Okay, I'll update the context for that image..." and then summarize the new information you are adding.
4. Photo Navigation: If the user asks to see a specific photo, confirm that you are showing it (e.g., "Of course, showing the photo of the wedding now.").

${currentPhotoMessage}. Begin the conversation now.`;
}
