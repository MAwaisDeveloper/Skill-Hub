// Shared client-side validation for auth forms (Login + Register).
// Rules: name = English letters/spaces only (3-40), phone = digits only (11, starts 03),
// password 8-64 with strength meter, confirm must match.

export const NAME_MIN = 3;
export const NAME_MAX = 40;
export const PHONE_LEN = 11;
export const PWD_MIN = 8;
export const PWD_MAX = 64;

// English letters + spaces only (no digits, symbols or Urdu script)
export function validateName(value) {
  const v = value.trim();
  if (!v) return 'Full name is required.';
  if (v.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters.`;
  if (v.length > NAME_MAX) return `Name must be at most ${NAME_MAX} characters.`;
  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(v)) return 'Name may only contain English letters and single spaces (no numbers or symbols).';
  return '';
}

// Digits only, exactly 11, starts with 03
export function validatePhone(value) {
  const v = value.trim();
  if (!v) return 'Phone number is required.';
  if (/\D/.test(v)) return 'Phone number may contain digits only.';
  if (v.length !== PHONE_LEN) return `Phone number must be exactly ${PHONE_LEN} digits (03XXXXXXXXX).`;
  if (!v.startsWith('03')) return 'Phone number must start with 03.';
  return '';
}

// Email must start with an English letter (not a number); standard format after that.
// Email-first auth: required on register (login is email + password).
export function validateEmail(value) {
  const v = value.trim();
  if (!v) return 'Email is required.';
  if (v.length > 254) return 'Email is too long.';
  if (!/^[A-Za-z][^\s@]*@[^\s@]+\.[A-Za-z]{2,}$/.test(v)) return 'Enter a valid email address (must start with a letter, e.g. ali@gmail.com).';
  return '';
}

export function passwordChecks(value) {
  return {
    length: value.length >= PWD_MIN && value.length <= PWD_MAX,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    digit: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
    tooLong: value.length > PWD_MAX,
  };
}

export function passwordStrength(value) {
  if (!value) return { score: 0, label: '', color: '#dcdcdc' };
  const c = passwordChecks(value);
  const score = [c.length, c.upper, c.lower, c.digit, c.symbol].filter(Boolean).length;
  if (value.length < PWD_MIN) return { score: Math.min(score, 1), label: 'Too short', color: '#e05252' };
  if (score <= 2) return { score: 2, label: 'Weak', color: '#e05252' };
  if (score === 3) return { score: 3, label: 'Fair', color: '#e0a53f' };
  if (score === 4) return { score: 4, label: 'Good', color: '#5faa68' };
  return { score: 5, label: 'Strong', color: '#2f9e44' };
}

export function validatePassword(value) {
  const v = value;
  if (!v) return 'Password is required.';
  if (v.length > PWD_MAX) return `Password must be at most ${PWD_MAX} characters.`;
  if (v.length < PWD_MIN) return `Password must be at least ${PWD_MIN} characters.`;
  const c = passwordChecks(v);
  if (!(c.upper && c.lower && c.digit)) return 'Password must include an uppercase letter, a lowercase letter and a number.';
  return '';
}
