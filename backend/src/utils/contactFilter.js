// Contact-info / off-platform-payment detection (Section 9 - Message filter)
// Flags phone numbers, emails, off-platform apps, and cash-deal phrases.

const patterns = [
  { re: /(?:\+?92|0)3\d{2}[\s-]?\d{7}|\b03\d{9}\b/gi, reason: 'phone number' },
  { re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, reason: 'email address' },
  { re: /\b(?:whatsapp|wa\.me|imo|skype|telegram|viber)\b/gi, reason: 'off-platform app' },
  { re: /\b(?:cash\s*(?:de\s*)?do|cash\s*paisay|cash\s*payment|naqad|off\s*platform|direct\s*payment)\b/gi, reason: 'cash/off-platform payment phrase' },
  { re: /\b0(3\d{2})[\s-]?\d{3}[\s-]?\d{4}\b/gi, reason: 'phone number' },
];

function checkContactInfo(text) {
  const found = [];
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) found.push({ reason: p.reason, sample: m[0] });
  }
  return found;
}

function redactText(text) {
  let out = String(text);
  for (const p of patterns) {
    out = out.replace(p.re, '[hidden by Hunar]');
  }
  return out;
}

module.exports = { checkContactInfo, redactText };
