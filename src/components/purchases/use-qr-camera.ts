"use client";

import { BrowserQRCodeReader } from "@zxing/browser";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useQrCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  onRead: (value: string) => void,
  onMessage: (message: string) => void,
) {
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const generation = useRef(0);
  const startingRef = useRef(false);
  const dispose = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onRead, onMessage });
  useEffect(() => { callbacks.current = { onRead, onMessage }; });

  const stop = useCallback(() => {
    generation.current++;
    startingRef.current = false;
    dispose.current?.();
    dispose.current = null;
    setActive(false);
    setStarting(false);
  }, []);

  useLayoutEffect(() => {
    const background = () => {
      if (document.visibilityState === "hidden") {
        if (dispose.current || startingRef.current) {
          callbacks.current.onMessage("Kamera bola pozastavená pri odchode do pozadia. Znova ju zapnite.");
        }
        stop();
      }
    };
    document.addEventListener("visibilitychange", background);
    return () => {
      document.removeEventListener("visibilitychange", background);
      stop();
    };
  }, [stop]);

  async function start() {
    if (startingRef.current || dispose.current) return;
    const video = videoRef.current;
    if (!video || document.visibilityState === "hidden") return;
    startingRef.current = true;
    const attempt = ++generation.current;
    setStarting(true);
    callbacks.current.onMessage("");
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: { ideal: "environment" } },
      });
      if (attempt !== generation.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      const ownedStream = stream;
      let controls: ReturnType<BrowserQRCodeReader["scan"]> | null = null;
      const timers: {
        frames?: ReturnType<typeof setInterval>;
        play?: ReturnType<typeof setTimeout>;
      } = {};
      const tracks = ownedStream.getVideoTracks();
      const interrupted = () => {
        if (attempt !== generation.current) return;
        stop();
        callbacks.current.onMessage("Kamera prestala poskytovať obraz. Znova ju zapnite; obnovenie stránky nie je potrebné.");
      };
      dispose.current = () => {
        clearInterval(timers.frames);
        clearTimeout(timers.play);
        tracks.forEach(track => track.removeEventListener("ended", interrupted));
        controls?.stop();
        ownedStream.getTracks().forEach(track => track.stop());
        if (video.srcObject === ownedStream) {
          video.pause();
          video.srcObject = null;
        }
      };
      tracks.forEach(track => track.addEventListener("ended", interrupted));
      video.srcObject = ownedStream;
      timers.play = setTimeout(interrupted, 10_000);
      await video.play();
      if (attempt !== generation.current) return;
      clearTimeout(timers.play);
      const reader = new BrowserQRCodeReader();
      controls = reader.scan(video, (result) => {
        if (attempt !== generation.current) return;
        if (result) callbacks.current.onRead(result.getText());
      }, error => {
        if (error && attempt === generation.current) {
          console.error("QR camera decoding failed.", error.name);
          interrupted();
        }
      });
      if (attempt !== generation.current) { controls.stop(); return; }
      let lastTime = video.currentTime;
      let lastFrameAt = Date.now();
      timers.frames = setInterval(() => {
        if (video.currentTime > lastTime && !tracks.some(track => track.muted || track.readyState === "ended")) {
          lastTime = video.currentTime;
          lastFrameAt = Date.now();
        } else if (Date.now() - lastFrameAt >= 15_000) interrupted();
      }, 2_000);
      setActive(true);
    } catch (error) {
      if (attempt !== generation.current) return;
      stop();
      stream?.getTracks().forEach(track => track.stop());
      console.error("QR camera startup failed.", error instanceof Error ? error.name : "UnknownError");
      callbacks.current.onMessage("Kameru sa nepodarilo spustiť. Overte povolenie kamery a použite HTTPS. Môžete ju skúsiť zapnúť znova.");
    } finally {
      if (attempt === generation.current) {
        startingRef.current = false;
        setStarting(false);
      }
    }
  }

  return { active, starting, start, stop };
}
