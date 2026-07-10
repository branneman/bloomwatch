import { useId, useState, type FormEvent } from "react";
import { parseReportInput } from "../../../report/parseReportInput";

export interface ParsedReport {
  reportCode: string;
  fightId: number | null;
}

export interface ReportInputProps {
  onSubmit: (report: ParsedReport) => void;
}

export function ReportInput({ onSubmit }: ReportInputProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = parseReportInput(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    onSubmit({ reportCode: result.reportCode, fightId: result.fightId });
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={inputId}>Report URL or code</label>
      <input
        id={inputId}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="https://fresh.warcraftlogs.com/reports/..."
      />
      <button type="submit">Load report</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
