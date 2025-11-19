import zlib from 'node:zlib'

const EOCD_SIG = 0x06054b50 // PK\05\06
const CEN_HDR_SIG = 0x02014b50 // PK\01\02
const LOC_HDR_SIG = 0x04034b50 // PK\03\04

type CentralEntry = {
  name: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  relativeOffsetOfLocalHeader: number
}

async function fetchRange(url: string, range: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { Range: range } })
  if (!res.ok) {
    throw new Error(
      `Range fetch failed: ${res.status} ${res.statusText} for ${range}`,
    )
  }
  return Buffer.from(await res.arrayBuffer())
}

async function probeRangeSupport(url: string): Promise<void> {
  // Some servers omit Accept-Ranges header; probe explicitly
  const res = await fetch(url, { headers: { Range: 'bytes=0-0' } })
  if (res.status !== 206)
    throw new Error(
      'Server does not support Range requests (no 206 Partial Content).',
    )
}

async function getCentralDirInfo(
  url: string,
): Promise<{ sizeCentralDir: number; offsetCentralDir: number }> {
  // EOCD must live within the last 65536 bytes (plus EOCD size) per spec
  const tail = await fetchRange(url, 'bytes=-65536')
  const sigBuf = Buffer.allocUnsafe(4)
  sigBuf.writeUInt32LE(EOCD_SIG, 0)
  const pos = tail.lastIndexOf(sigBuf)
  if (pos === -1)
    throw new Error(
      'EOCD signature not found in tail (not a valid ZIP or too large comment).',
    )

  const sizeCentralDir = tail.readUInt32LE(pos + 12)
  const offsetCentralDir = tail.readUInt32LE(pos + 16)
  return { sizeCentralDir, offsetCentralDir }
}

function parseCentralDirectory(buf: Buffer): Array<CentralEntry> {
  const entries: Array<CentralEntry> = []
  let p = 0

  while (p + 4 <= buf.length) {
    const sig = buf.readUInt32LE(p)
    if (sig !== CEN_HDR_SIG) break

    // central dir fixed header fields we need
    const compressionMethod = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const uncompressedSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const relOffset = buf.readUInt32LE(p + 42)

    const nameStart = p + 46
    const nameEnd = nameStart + nameLen
    if (nameEnd > buf.length) break // malformed

    const name = buf.slice(nameStart, nameEnd).toString('utf8')

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      relativeOffsetOfLocalHeader: relOffset,
    })

    p = nameEnd + extraLen + commentLen
  }

  return entries
}

async function readLocalHeader(url: string, relOffset: number) {
  // local header fixed size is 30 bytes
  const buf = await fetchRange(url, `bytes=${relOffset}-${relOffset + 29}`)
  const sig = buf.readUInt32LE(0)
  if (sig !== LOC_HDR_SIG) throw new Error('Local header signature mismatch')

  const compressionMethod = buf.readUInt16LE(8)
  const compressedSize = buf.readUInt32LE(18)
  const uncompressedSize = buf.readUInt32LE(22)
  const nameLen = buf.readUInt16LE(26)
  const extraLen = buf.readUInt16LE(28)

  const dataStart = relOffset + 30 + nameLen + extraLen
  return {
    compressionMethod,
    compressedSize,
    uncompressedSize,
    nameLen,
    extraLen,
    dataStart,
  }
}

/**
 * List file names inside a remote zip using range requests.
 */
export async function listRemoteZip(url: string): Promise<Array<string>> {
  await probeRangeSupport(url)
  const { sizeCentralDir, offsetCentralDir } = await getCentralDirInfo(url)
  const range = `bytes=${offsetCentralDir}-${offsetCentralDir + sizeCentralDir - 1}`
  const centralBuf = await fetchRange(url, range)
  const entries = parseCentralDirectory(centralBuf)
  return entries.map((e) => e.name)
}

/**
 * Extract a single entry (by exact name) from remote zip and write to outPath.
 * Supports compression methods 0 (stored) and 8 (deflate).
 */
export async function extractEntry(
  url: string,
  entryName: string,
): Promise<{ size: number; stream: ReadableStream<Uint8Array> }> {
  await probeRangeSupport(url)

  const { sizeCentralDir, offsetCentralDir } = await getCentralDirInfo(url)
  const centralRange = `bytes=${offsetCentralDir}-${offsetCentralDir + sizeCentralDir - 1}`
  const centralBuf = await fetchRange(url, centralRange)
  const entries = parseCentralDirectory(centralBuf)

  const entry = entries.find((e) => e.name === entryName)
  if (!entry)
    throw new Error(`Entry "${entryName}" not found in central directory.`)

  // read local header to compute start of compressed data
  const local = await readLocalHeader(url, entry.relativeOffsetOfLocalHeader)

  // prefer the compressed size from central dir (handles data descriptor cases)
  const compressedSize = entry.compressedSize || local.compressedSize
  const dataRange = `bytes=${local.dataStart}-${local.dataStart + compressedSize - 1}`
  const compBuf = await fetchRange(url, dataRange)

  let outBuf: Buffer
  if (local.compressionMethod === 0) {
    // stored
    outBuf = compBuf
  } else if (local.compressionMethod === 8) {
    // deflate
    outBuf = zlib.inflateRawSync(compBuf)
  } else {
    throw new Error(
      `Unsupported compression method: ${local.compressionMethod}`,
    )
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(outBuf)
      controller.close()
    },
  })

  return { size: outBuf.length, stream }
}
