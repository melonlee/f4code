import { secondTick } from "@f4code/client-runtime/clock";
import { useSyncExternalStore } from "react";

export function useNowSecond(): number {
  return useSyncExternalStore(secondTick.subscribe, secondTick.getSnapshot, secondTick.getSnapshot);
}
