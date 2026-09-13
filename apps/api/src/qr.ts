import QRCode from "qrcode";

export async function qrSvg(payload: string): Promise<string> {
  if (!payload) throw new Error("nothing to encode");
  return QRCode.toString(payload, { type: "svg", margin: 1, width: 260, errorCorrectionLevel: "M" });
}
