export const noteDetail = (returnBp: number, maturity: string) =>
  `${(returnBp / 100).toFixed(1)}% annualized target · matures ${maturity}`;
