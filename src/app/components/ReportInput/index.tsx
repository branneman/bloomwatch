import { useState, type FormEvent } from "react";
import { parseReportInput } from "../../../report/parseReportInput";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { Alert } from "../ui/Alert";
import styles from "./index.module.css";

export interface ParsedReport {
  reportCode: string;
  fightId: number | null;
}

export interface ReportInputProps {
  onSubmit: (report: ParsedReport) => void;
}

export function ReportInput({ onSubmit }: ReportInputProps) {
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
      <div className={styles.form}>
        <Field label="Report URL or code" className={styles.field}>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="https://fresh.warcraftlogs.com/reports/..."
          />
        </Field>
        <Button type="submit" className={styles.submit}>
          Load report
        </Button>
      </div>
      {error && <Alert tone="warning">{error}</Alert>}
    </form>
  );
}
