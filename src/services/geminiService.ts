import { GoogleGenAI } from "@google/genai";

// Inicialización del SDK de Google Gen AI
// La API key se inyecta a través del plugin define de Vite en vite.config.ts
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Genera embeddings multimodales utilizando el modelo gemini-embedding-2-preview.
 * Convierte archivos a Base64 para enviarlos como inlineData.
 */
export async function generateMultimodalEmbeddings(
  text: string,
  imageFile?: File | null,
  audioFile?: File | null
) {
  const contents: any[] = [];

  // 1. Añadir texto
  if (text && text.trim() !== '') {
    contents.push(text);
  }

  // 2. Añadir imagen
  if (imageFile) {
    const base64Image = await fileToBase64(imageFile);
    contents.push({
      inlineData: {
        data: base64Image.split(',')[1],
        mimeType: imageFile.type,
      },
    });
  }

  // 3. Añadir audio
  if (audioFile) {
    const base64Audio = await fileToBase64(audioFile);
    contents.push({
      inlineData: {
        data: base64Audio.split(',')[1],
        mimeType: audioFile.type,
      },
    });
  }

  if (contents.length === 0) {
    throw new Error("Debes proporcionar al menos un tipo de contenido (texto, imagen o audio).");
  }

  // Llamada a la API de Gemini
  const result = await ai.models.embedContent({
    model: 'gemini-embedding-2-preview',
    contents: contents,
  });

  return result.embeddings;
}

/**
 * Utilidad para convertir un objeto File a una cadena Base64
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}
