import QRCode from "qrcode";
import { cn } from "@/lib/cn";

function toSvg(value: string): string {
  const qr = QRCode.create(value, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (qr.modules.get(y, x)) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#f4f4f5"/><g fill="#09090b">${cells.join("")}</g></svg>`;
}

export function QrCode({ value, className }: { value: string; className?: string }) {
  if (!value) return <div className={cn("size-44 rounded-sm bg-elevated", className)} />;
  return (
    <div
      className={cn("size-44 overflow-hidden rounded-sm bg-fg p-1 [&_svg]:size-full", className)}
      dangerouslySetInnerHTML={{ __html: toSvg(value) }}
    />
  );
}
