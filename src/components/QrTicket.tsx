"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrTicket({ reference, size = 152 }: { reference: string; size?: number }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    QRCode.toDataURL(reference, { margin: 2, width: Math.max(size * 2, 256), color: { dark: "#07110d", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [reference, size]);

  if (!src) return <div className="skeleton rounded-2xl" style={{ width: size, height: size }} />;
  return (
    <a href={src} download={`${reference}.png`} aria-label={`Download QR ticket ${reference}`} className="inline-block rounded-2xl bg-white p-2 shadow-2xl shadow-emerald-950/40">
      <Image src={src} alt={`QR ticket for ${reference}`} width={size} height={size} unoptimized />
    </a>
  );
}
