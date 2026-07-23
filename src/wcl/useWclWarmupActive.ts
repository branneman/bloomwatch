import { useEffect, useState } from "react";
import { subscribeWclWarmup } from "./wclWarmup";

export function useWclWarmupActive(): boolean {
  const [activeCount, setActiveCount] = useState(0);

  useEffect(() => subscribeWclWarmup(setActiveCount), []);

  return activeCount > 0;
}
