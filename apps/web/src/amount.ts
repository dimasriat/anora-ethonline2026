export const digitsOf = (value: string) => value.replace(/[^0-9]/g, "");

export const formatIdr = (digits: string) =>
  digits ? Number(digits).toLocaleString("id-ID") : "";

export const digitsBefore = (value: string, caret: number) =>
  digitsOf(value.slice(0, caret)).length;

export const caretAfterDigits = (formatted: string, count: number) => {
  if (count === 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i += 1) {
    if (formatted[i]! >= "0" && formatted[i]! <= "9") seen += 1;
    if (seen === count) return i + 1;
  }
  return formatted.length;
};
