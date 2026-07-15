import { useState } from "react";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface OwnClientIdFieldProps {
  onConnect: (clientId: string) => void;
}

export function OwnClientIdField({ onConnect }: OwnClientIdFieldProps) {
  const [value, setValue] = useState("");

  return (
    <div className={styles.ownClientIdField}>
      <Field label="WCL API Client ID">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste your Client ID"
        />
      </Field>
      <p className={styles.helper}>
        Don&apos;t have one?{" "}
        <a
          href="https://www.warcraftlogs.com/api/clients/"
          target="_blank"
          rel="noreferrer"
        >
          Register a free client
        </a>{" "}
        at warcraftlogs.com — check &quot;Public Client&quot;, and use this
        page&apos;s URL as the redirect.
      </p>
      <Button
        className={styles.submit}
        onClick={() => onConnect(value)}
        disabled={value.trim() === ""}
      >
        Connect with this Client ID
      </Button>
    </div>
  );
}
