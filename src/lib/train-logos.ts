import trainLogos from "@/train_logos.json";
import { getLine } from "@/lib/train-lines";

interface LogoEntry {
  name: string;
  id: string;
  markdown: string;
  source?: string;
}

interface LogoFile {
  source: string;
  format: string;
  note: string;
  companies: Record<string, LogoEntry>;
}

const data = trainLogos as unknown as LogoFile;

const byCompany = new Map<string, LogoEntry>(
  Object.entries(data.companies).map(([company, entry]) => [company.normalize("NFC"), entry]),
);

export function operatorEmoji(company: string | null | undefined): string | null {
  if (!company) return null;
  return byCompany.get(company.normalize("NFC"))?.markdown ?? null;
}

function sharedPrefix(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

const OPERATOR_OVERRIDES: Record<string, string> = {
  jr_tohoku_shin: "JR東日本",
  midosuji: "大阪メトロ",
};

export function lineOperator(rosenCode: string): string | null {
  const line = getLine(rosenCode);
  if (!line || line.operators.length === 0) return null;

  const override = OPERATOR_OVERRIDES[rosenCode];
  if (override && line.operators.some((o) => o.normalize("NFC") === override)) return override;

  if (line.operators.length === 1) return line.operators[0] ?? null;

  let best = line.operators[0] ?? null;
  let bestScore = -1;
  for (const operator of line.operators) {
    const slug = byCompany.get(operator.normalize("NFC"))?.name ?? "";
    const score = sharedPrefix(rosenCode, slug);
    if (score > bestScore) {
      bestScore = score;
      best = operator;
    }
  }
  return best;
}

export function lineEmoji(rosenCode: string): string {
  return operatorEmoji(lineOperator(rosenCode)) ?? "";
}
