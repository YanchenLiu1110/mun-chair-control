/**
 * 报告导出：SVG → PNG → PDF
 *
 * 不引第三方库：
 *   · PNG 走 canvas，浏览器自带
 *   · PDF 手写一个单页文件，把 JPEG 用 DCTDecode 直接嵌进去 ——
 *     这是唯一不需要压缩算法、几十行就能写对的嵌入方式
 */

/** 把页面里的 SVG 元素栅格化成 PNG */
export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const vb = (svg.getAttribute('viewBox') ?? '0 0 1240 880').split(/[\s,]+/).map(Number);
  const w = vb[2] || 1240;
  const h = vb[3] || 880;
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));

  const xml = new XMLSerializer().serializeToString(clone);
  // 用 data URI 而不是 blob URL：blob URL 里的 SVG 在部分浏览器上无法加载外部字体/图片，
  // 而且这里的内容全是内联形状与文本，data URI 足够且不会泄漏对象
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  img.decoding = 'sync';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('报告渲染失败：SVG 无法转为位图'));
    img.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG 编码失败'))), 'image/png');
  });
}

interface PdfParts {
  chunks: Uint8Array[];
  length: number;
}

function pushText(buf: PdfParts, text: string): void {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  buf.chunks.push(bytes);
  buf.length += bytes.length;
}

function pushBytes(buf: PdfParts, bytes: Uint8Array): void {
  buf.chunks.push(bytes);
  buf.length += bytes.length;
}

/** 把一张位图包成单页 PDF（A4 横向宽度，高度按图片比例） */
export async function imageToPdf(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('当前浏览器不支持 canvas');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const raw = atob(base64);
  const jpeg = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) jpeg[i] = raw.charCodeAt(i);

  const pageW = 842; // A4 横向 297mm ≈ 842pt
  const pageH = Math.round((pageW * canvas.height) / canvas.width);

  const buf: PdfParts = { chunks: [], length: 0 };
  const offsets: number[] = [];

  pushText(buf, '%PDF-1.4\n');
  // 二进制标记，告诉阅读器这是二进制文件
  pushBytes(buf, new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const obj = (body: string) => {
    offsets.push(buf.length);
    pushText(buf, body);
  };

  obj('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  obj('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  obj(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  offsets.push(buf.length);
  pushText(
    buf,
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  pushBytes(buf, jpeg);
  pushText(buf, '\nendstream\nendobj\n');

  const content = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefAt = buf.length;
  let xref = `xref\n0 ${offsets.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  pushText(buf, xref);
  pushText(
    buf,
    `trailer\n<< /Size ${offsets.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`,
  );

  return new Blob(buf.chunks as BlobPart[], { type: 'application/pdf' });
}

export function saveBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
