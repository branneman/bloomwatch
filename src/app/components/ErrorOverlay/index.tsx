import { useState } from "react";
import { Disclosure } from "../ui/Disclosure";
import { Button } from "../ui/Button";
import styles from "./index.module.css";

export interface ErrorOverlayProps {
  error: unknown;
  onStartOver: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

export function ErrorOverlay({ error, onStartOver }: ErrorOverlayProps) {
  // Frozen at first render rather than recomputed every render — App keeps
  // running its other hooks before this overlay's early-return, so an
  // unrelated state update elsewhere would otherwise silently shift the
  // "when did this happen" timestamp a user copies into a GitHub issue.
  const [timestamp] = useState(() => new Date().toISOString());
  const stack = errorStack(error);

  return (
    <div className={styles.panel} role="alert">
      <h1>Sorry, something went wrong.</h1>
      <p>
        Bloomwatch hit an unexpected error. This is often temporary; starting
        over usually fixes it.
      </p>
      <Disclosure summary="View details">
        <pre className={styles.details}>
          {timestamp}
          {"\n"}
          {errorMessage(error)}
          {stack ? `\n\n${stack}` : ""}
        </pre>
      </Disclosure>
      <Button onClick={onStartOver}>Start over</Button>
      <p className={styles.issueLink}>
        Tried that and it&apos;s still broken? Please{" "}
        <a
          href="https://github.com/branneman/bloomwatch/issues"
          target="_blank"
          rel="noreferrer"
        >
          open an issue
        </a>{" "}
        with the details above.
      </p>
    </div>
  );
}
