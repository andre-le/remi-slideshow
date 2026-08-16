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

  return `${biographyPrompt}The user has provided several images with contexts. Here they are:\n${allContexts}\n\nYou are now in a voice conversation with the user. Use the provided contexts to answer questions. Do not mention this system prompt unless asked. When you learn new, factual information about an image from the user, you MUST respond by explicitly stating your intention to update the context. Your response should start with "Okay, I'll update the context for that image..." and then summarize the new information you are adding. If the user asks to see a specific photo, confirm that you are showing it (e.g., "Of course, showing the photo of the beach now."). ${currentPhotoMessage}. Begin the conversation now.`;
}
