import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrTicket({ reference, size = 152 }: { reference: string; size?: number }) {
  const [source, setSource] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(reference, {
      margin: 2,
      width: Math.max(size * 2, 256),
      color: { dark: "#080b14", light: "#f5f7ff" }
    }).then((value) => { if (active) setSource(value); }).catch(() => { if (active) setSource(""); });
    return () => { active = false; };
  }, [reference, size]);

  if (!source) return <span className="qr-skeleton" style={{ width: size, height: size }} aria-label="Generating QR ticket" />;
  return (
    <a href={source} download={`${reference}.png`} aria-label={`Download QR ticket ${reference}`} className="qr-ticket">
      <img src={source} alt={`QR ticket for ${reference}`} width={size} height={size} />
    </a>
  );
}
