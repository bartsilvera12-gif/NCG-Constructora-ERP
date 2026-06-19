"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Modal de cámara con `getUserMedia`. En desktop abre el visor con preview en
 * vivo; el botón Capturar genera un JPEG y lo entrega vía `onCapture`. En
 * mobile (donde getUserMedia suele funcionar mal o el usuario prefiere la
 * cámara del sistema) llamá a `onFallback` para abrir un <input capture>.
 *
 * Mismo comportamiento que el modal de archivos de obra: si el navegador no
 * tiene permiso o cámara, mostramos un error con el botón "Usar cámara del
 * sistema" para no dejar al usuario sin salida.
 */
export default function CamaraModal({
  onClose,
  onCapture,
  onFallback,
}: {
  onClose: () => void;
  onCapture: (file: File) => void;
  onFallback?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          await new Promise<void>((resolve) => {
            if (v.videoWidth > 0) return resolve();
            const onMeta = () => { v.removeEventListener("loadedmetadata", onMeta); resolve(); };
            v.addEventListener("loadedmetadata", onMeta);
          });
          await v.play().catch(() => {});
        }
        setListo(true);
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.name === "NotAllowedError"
              ? "No se otorgó permiso para usar la cámara."
              : e.name === "NotFoundError"
              ? "No se detectó ninguna cámara."
              : e.message
            : "No se pudo acceder a la cámara."
        );
      }
    })();
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    if (!video || !listo) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) {
      setErr("La cámara aún no está lista. Esperá un segundo y volvé a intentar.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setErr("El navegador no soporta canvas 2D.");
      return;
    }
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size === 0) {
          setErr("No se pudo capturar la foto (blob vacío).");
          return;
        }
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = new File([blob], `foto-${ts}.jpg`, { type: "image/jpeg" });
        onCapture(file);
      },
      "image/jpeg",
      0.92
    );
  }

  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-900/90 p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar cámara"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>

      <div className="w-full max-w-3xl">
        {err ? (
          <div className="rounded-lg bg-white p-6 text-center">
            <p className="text-sm text-rose-600">{err}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              {onFallback ? (
                <button
                  type="button"
                  onClick={onFallback}
                  className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3F8E91]"
                >
                  Usar cámara del sistema
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="block w-full max-h-[70vh] object-contain"
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={capturar}
                disabled={!listo}
                className="inline-flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-5 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path d="M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
                  <path fillRule="evenodd" d="M3.5 5A1.5 1.5 0 0 1 5 3.5h1l1-1.5h6l1 1.5h1A1.5 1.5 0 0 1 16.5 5v9A1.5 1.5 0 0 1 15 15.5H5A1.5 1.5 0 0 1 3.5 14V5Zm6.5 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" clipRule="evenodd" />
                </svg>
                Capturar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
