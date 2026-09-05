import type { BulkContext, RawBulkRow } from './bulkAssessment';
import { BULK_MAX_FILE_BYTES, BULK_MAX_ROWS, safeCsvCell, templateRows } from './bulkAssessment';

const REQUIRED = ['Assessment_ID', 'Enrollment_ID', 'Nilai'];
const MAX_UNCOMPRESSED_ENTRY_BYTES = 4_000_000;

function esc(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number) { return [n & 255, (n >>> 8) & 255]; }
function u32(n: number) { return [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]; }

function zipStore(files: { name: string; data: Uint8Array }[]) {
  const out: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name);
    const crc = crc32(file.data);
    const local = [
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(file.data.length), ...u32(file.data.length), ...u16(name.length), ...u16(0), ...name,
    ];
    out.push(...local, ...file.data);
    central.push(
      ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(crc), ...u32(file.data.length), ...u32(file.data.length), ...u16(name.length), ...u16(0),
      ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name,
    );
    offset = out.length;
  }
  const start = out.length;
  out.push(
    ...central,
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(central.length), ...u32(start), ...u16(0),
  );
  return new Uint8Array(out);
}

export function makeXlsxTemplate(ctx: BulkContext) {
  const headers = ['Assessment_ID', 'Enrollment_ID', 'NIS', 'NISN', 'Nama', 'Nilai'];
  const rows = templateRows(ctx);
  const all = [headers, ...rows.map(row => headers.map(header => (row as Record<string, unknown>)[header]))];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${all.map((row, ri) => `<row r="${ri + 1}">${row.map((value, ci) => { const ref = String.fromCharCode(65 + ci) + (ri + 1); return `<c r="${ref}" t="inlineStr"><is><t>${esc(value)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const enc = new TextEncoder();
  const files = [
    { name: '[Content_Types].xml', data: enc.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: '_rels/.rels', data: enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: enc.encode('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Nilai SMP" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: enc.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: enc.encode(sheet) },
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function n16(data: Uint8Array, offset: number) { return data[offset] | (data[offset + 1] << 8); }
function n32(data: Uint8Array, offset: number) { return (data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24)) >>> 0; }

async function readStreamBounded(stream: ReadableStream<Uint8Array>, limit: number) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel('entry too large');
      throw new Error('Worksheet terlalu besar setelah dekompresi.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

async function unzipEntry(data: Uint8Array, nameWanted: string, required = true) {
  let p = 0;
  while (p + 30 < data.length && n32(data, p) === 0x04034b50) {
    const method = n16(data, p + 8);
    const compressedSize = n32(data, p + 18);
    const declaredUncompressedSize = n32(data, p + 22);
    const nameLength = n16(data, p + 26);
    const extraLength = n16(data, p + 28);
    const name = new TextDecoder().decode(data.slice(p + 30, p + 30 + nameLength));
    const start = p + 30 + nameLength + extraLength;
    const raw = data.slice(start, start + compressedSize);

    if (name === nameWanted) {
      if (declaredUncompressedSize > MAX_UNCOMPRESSED_ENTRY_BYTES) throw new Error('Worksheet terlalu besar.');
      if (method === 0) {
        if (raw.byteLength > MAX_UNCOMPRESSED_ENTRY_BYTES) throw new Error('Worksheet terlalu besar.');
        return raw;
      }
      if (method === 8) {
        const decompressed = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return readStreamBounded(decompressed, MAX_UNCOMPRESSED_ENTRY_BYTES);
      }
      throw new Error('Kompresi XLSX tidak didukung.');
    }
    p = start + compressedSize;
  }
  if (required) throw new Error('Worksheet utama tidak ditemukan.');
  return null;
}

function colIndex(ref: string) {
  let n = 0;
  for (const c of ref.replace(/\d/g, '')) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}

function sharedStringValues(xml: string) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('sharedStrings XML rusak.');
  return [...doc.getElementsByTagNameNS('*', 'si')]
    .map(item => [...item.getElementsByTagNameNS('*', 't')].map(text => text.textContent ?? '').join(''));
}

export async function parseXlsx(file: File, expectedAssessmentId: string): Promise<RawBulkRow[]> {
  if (file.size > BULK_MAX_FILE_BYTES) throw new Error('File XLSX terlalu besar.');
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Gunakan file .xlsx Nilai SMP.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (n32(bytes, 0) !== 0x04034b50) throw new Error('Workbook rusak atau bukan XLSX.');

  const xml = new TextDecoder().decode((await unzipEntry(bytes, 'xl/worksheets/sheet1.xml'))!);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Worksheet XML rusak.');
  if (doc.getElementsByTagNameNS('*', 'f').length > 0) throw new Error('Formula tidak diterima. Gunakan nilai biasa.');

  const sharedRaw = await unzipEntry(bytes, 'xl/sharedStrings.xml', false);
  const shared = sharedRaw ? sharedStringValues(new TextDecoder().decode(sharedRaw)) : [];
  const matrix = [...doc.getElementsByTagNameNS('*', 'row')].map(row => {
    const cells: string[] = [];
    for (const cell of [...row.getElementsByTagNameNS('*', 'c')]) {
      const ref = cell.getAttribute('r') ?? 'A1';
      const type = cell.getAttribute('t');
      const value = cell.getElementsByTagNameNS('*', 'v')[0]?.textContent ?? '';
      let text = '';
      if (type === 'inlineStr') text = cell.getElementsByTagNameNS('*', 't')[0]?.textContent ?? '';
      else if (type === 's') {
        const index = Number(value);
        if (!Number.isInteger(index) || index < 0 || index >= shared.length) throw new Error('sharedStrings index tidak valid.');
        text = shared[index];
      } else text = value;
      cells[colIndex(ref)] = text;
    }
    return cells;
  });

  if (!matrix.length) throw new Error('Worksheet kosong.');
  const headers = matrix[0].map(value => value?.trim() ?? '');
  for (const header of REQUIRED) if (!headers.includes(header)) throw new Error(`Kolom wajib ${header} tidak ada.`);
  if (matrix.length - 1 > BULK_MAX_ROWS) throw new Error(`Maksimal ${BULK_MAX_ROWS} baris.`);

  const get = (row: string[], header: string) => row[headers.indexOf(header)]?.trim() ?? '';
  return matrix.slice(1).filter(row => row.some(Boolean)).map((row, index) => {
    const assessment = get(row, 'Assessment_ID');
    if (assessment !== expectedAssessmentId) throw new Error(`Baris ${index + 2}: Assessment_ID tidak cocok.`);
    const enrollmentId = get(row, 'Enrollment_ID');
    if (!enrollmentId) throw new Error(`Baris ${index + 2}: Enrollment_ID wajib.`);
    return {
      row: index + 2,
      enrollmentId,
      nis: get(row, 'NIS'),
      nisn: get(row, 'NISN'),
      name: get(row, 'Nama'),
      value: get(row, 'Nilai'),
    };
  });
}

export function makeCsvFallback(ctx: BulkContext) {
  const rows = templateRows(ctx);
  const headers = ['Assessment_ID', 'Enrollment_ID', 'NIS', 'NISN', 'Nama', 'Nilai'];
  return new Blob([
    [headers.join(','), ...rows.map(row => headers.map(header => safeCsvCell((row as Record<string, unknown>)[header])).join(','))].join('\r\n'),
  ], { type: 'text/csv;charset=utf-8' });
}
