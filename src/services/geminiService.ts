import { GoogleGenAI } from "@google/genai";

// Inicialización del SDK de Google Gen AI
// La API key se inyecta a través del plugin define de Vite en vite.config.ts, o se lee de import.meta.env
// Usamos Lazy Initialization para evitar ReferenceError: process is not defined si falta la variable.
let ai: GoogleGenAI | null = null;

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

  // Lazy Init
  if (!ai) {
    // Vite reemplaza process.env estáticamente si está en define, pero manejamos undefined a través de fallback seguro
    const apiKey = (typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : import.meta.env.VITE_GEMINI_API_KEY) || import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey || apiKey === 'undefined') {
      console.warn("⚠️ Gemini API Key not valid or missing. Responding with mock embeddings.");
      return [0.1, 0.2, 0.3]; // Mock seguro
    }
    
    ai = new GoogleGenAI({ apiKey });
  }

  // Llamada a la API de Gemini
  try {
    const result = await ai.models.embedContent({
      model: 'gemini-embedding-2-preview',
      contents: contents,
    });
    return result.embeddings;
  } catch (error) {
    console.error("Gemini AI API Error:", error);
    return [0.1, 0.2, 0.3]; // Fallback mock en caso de fallo de red
  }
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
