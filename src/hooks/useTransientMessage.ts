import { useEffect, useState } from "react";

export function useTransientMessage(timeoutMs: number) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [message, timeoutMs]);

  return [message, setMessage] as const;
}
