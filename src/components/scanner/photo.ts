// Outils navigateur du scanner : préparation des photos et OCR local (mode sans IA).
import type { Worker } from "tesseract.js";

/** Côté long maximal accepté en pleine résolution par la vision de Claude. */
const MAX_EDGE = 2576;

/**
 * Photo redressée (orientation EXIF), réduite et recompressée en JPEG : quelques centaines de Ko
 * à envoyer au lieu de plusieurs Mo, sans perdre la lisibilité des numéros de carte.
 */
export async function preparePhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponible");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Conversion de la photo impossible"))), "image/jpeg", 0.88),
  );
}

/**
 * Lecteur OCR réutilisé d'une photo à l'autre. Tesseract (moteur et données « eng », quelques Mo)
 * n'est téléchargé qu'au premier scan sans IA ; les chiffres et noms latins suffisent ici.
 */
export function createOcrReader() {
  let worker: Promise<Worker> | null = null;
  let onProgress: ((p: number) => void) | null = null;

  const getWorker = () =>
    (worker ??= import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", undefined, {
        logger: (m) => {
          if (m.status === "recognizing text") onProgress?.(m.progress);
        },
      }),
    ));

  return {
    async read(image: Blob, progress: (p: number) => void): Promise<string> {
      const w = await getWorker();
      onProgress = progress;
      try {
        return (await w.recognize(image)).data.text;
      } finally {
        onProgress = null;
      }
    },
    async dispose() {
      const w = worker;
      worker = null;
      if (w) await (await w).terminate();
    },
  };
}

export type OcrReader = ReturnType<typeof createOcrReader>;
