const crypto = require('crypto');
const { HttpError } = require('../middleware/error');

// Decode image dimensions from buffer (JPEG SOF / PNG IHDR) — no external deps
function getImageDimensions(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: 'png' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off < buf.length - 9) {
      if (buf[off] !== 0xff) { off += 1; continue; }
      const marker = buf[off + 1];
      const size = buf.readUInt16BE(off + 2);
      // SOF0..SOF15 (except DHT/JPG/DAC)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7), type: 'jpeg' };
      }
      off += 2 + size;
    }
  }
  return null;
}

function hashImage(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Validate one document image: type, size, dimensions
function validateImageBuffer(buf, { label, expectRatio = null, minRatio = null, maxRatio = null }) {
  if (!buf || !buf.length) throw new HttpError(400, `${label}: image required`);
  if (buf.length > 5 * 1024 * 1024) throw new HttpError(400, `${label}: max size 5MB`);
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  if (!isJpeg && !isPng) throw new HttpError(400, `${label}: sirf JPG ya PNG image allowed hai`);
  const dims = getImageDimensions(buf);
  if (!dims) throw new HttpError(400, `${label}: image read nahi ho saki (corrupt file?)`);
  if (dims.width < 300 || dims.height < 200) throw new HttpError(400, `${label}: image bohat chhoti hai (min 300x200)`);

  const ratio = dims.width / dims.height;
  if (minRatio && ratio < minRatio) {
    throw new HttpError(400, `${label}: ye CNIC card jaisi (landscape) nahi lagti — sahi photo upload karein (detected ${dims.width}x${dims.height})`);
  }
  if (maxRatio && ratio > maxRatio) {
    throw new HttpError(400, `${label}: ye photo landscape/CNIC jaisi hai — ${label === 'Selfie' ? 'live selfie (portrait)' : 'image'} chahiye (detected ${dims.width}x${dims.height})`);
  }
  if (expectRatio && (ratio < expectRatio.min || ratio > expectRatio.max)) {
    throw new HttpError(400, `${label}: ye CNIC card ratio (≈1.58) match nahi kar raha — front/back dono CNIC card ki photo hon (detected ${dims.width}x${dims.height})`);
  }
  return { dims, ratio, hash: hashImage(buf) };
}

module.exports = { getImageDimensions, hashImage, validateImageBuffer };
