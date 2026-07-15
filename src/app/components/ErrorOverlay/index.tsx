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
  const timestamp = new Date().toISOString();
  const stack = errorStack(error);

  return (
    <div className={styles.panel} role="alert">
      <h1>Sorry, something went wrong.</h1>
      <p>
        Bloomwatch hit an unexpected error. This is often temporary — starting
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
