"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { QIDENG_COLORS } from "../design-system-values";

export function WorkImageCropDialog({ file, text, onCancel, onConfirm }: {
  file: File;
  text: Record<string, string>;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}) {
  const [source, setSource] = useState("");
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    midpoint: { x: number; y: number };
    distance: number;
    offset: { x: number; y: number };
    zoom: number;
  } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function clamp(next: { x: number; y: number }, nextZoom = zoom) {
    const base = Math.max(320 / size.width, 320 / size.height);
    const width = size.width * base * nextZoom;
    const height = size.height * base * nextZoom;
    return {
      x: Math.max(-(width - 320) / 2, Math.min((width - 320) / 2, next.x)),
      y: Math.max(-(height - 320) / 2, Math.min((height - 320) / 2, next.y)),
    };
  }

  function pointerMidpoint(values: Array<{ x: number; y: number }>) {
    if (values.length === 1) return values[0];
    return { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
  }

  function pointerDistance(values: Array<{ x: number; y: number }>) {
    if (values.length < 2) return 1;
    return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
  }

  function beginGesture() {
    const values = [...pointers.current.values()].slice(0, 2);
    if (!values.length) {
      gesture.current = null;
      return;
    }
    gesture.current = {
      midpoint: pointerMidpoint(values),
      distance: pointerDistance(values),
      offset,
      zoom,
    };
  }

  async function confirm() {
    const image = imageRef.current;
    if (!image) return;
    setSaving(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 1200;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法裁切图片");
      const base = Math.max(1200 / image.naturalWidth, 1200 / image.naturalHeight);
      const scale = base * zoom;
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      context.fillStyle = QIDENG_COLORS.surface;
      context.fillRect(0, 0, 1200, 1200);
      context.drawImage(
        image,
        (1200 - width) / 2 + offset.x * 3.75,
        (1200 - height) / 2 + offset.y * 3.75,
        width,
        height,
      );
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!blob) throw new Error("图片处理失败");
      onConfirm(new File([blob], "representative.webp", { type: "image/webp" }));
    } finally {
      setSaving(false);
    }
  }

  const base = Math.max(320 / size.width, 320 / size.height);
  return <div className="dialog-backdrop"><section className="image-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
    <header><div><p className="eyebrow">IMAGE CROP</p><h2 id="crop-title">{text["writer.cropTitle"]}</h2><p>{text["writer.cropDescription"]}</p></div><button type="button" aria-label={text["writer.closePanel"]} onClick={onCancel}><X /></button></header>
    <div
      className="crop-stage"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        beginGesture();
      }}
      onPointerMove={(event) => {
        if (!pointers.current.has(event.pointerId) || !gesture.current) return;
        event.preventDefault();
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const values = [...pointers.current.values()].slice(0, 2);
        const midpoint = pointerMidpoint(values);
        const nextZoom = values.length > 1
          ? Math.min(4, Math.max(1, gesture.current.zoom * (pointerDistance(values) / gesture.current.distance)))
          : gesture.current.zoom;
        setZoom(nextZoom);
        setOffset(clamp({
          x: gesture.current.offset.x + midpoint.x - gesture.current.midpoint.x,
          y: gesture.current.offset.y + midpoint.y - gesture.current.midpoint.y,
        }, nextZoom));
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        beginGesture();
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId);
        beginGesture();
      }}
      onWheel={(event) => {
        event.preventDefault();
        const next = Math.min(4, Math.max(1, zoom - event.deltaY * 0.002));
        setZoom(next);
        setOffset((current) => clamp(current, next));
      }}
    >
      {/* Blob previews need the source element's natural dimensions for pixel-accurate canvas export. */}
      {source ? <img ref={imageRef} src={source} alt="待裁切代表图片" draggable={false} onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ width: size.width * base, height: size.height * base, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }} /> : null} {/* eslint-disable-line @next/next/no-img-element */}
    </div>
    <label className="crop-zoom"><span>{text["writer.cropZoom"]}</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => { const next = Number(event.target.value); setZoom(next); setOffset((current) => clamp(current, next)); }} /></label>
    <div className="crop-actions"><button className="button secondary" type="button" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>{text["writer.cropReset"]}</button><button className="button primary" type="button" disabled={saving} onClick={confirm}>{saving ? "处理中" : text["writer.cropConfirm"]}</button></div>
  </section></div>;
}
