import { useEffect, useState } from "react";

const KEY = "project-board.display-name";

export function useDisplayName() {
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setName(localStorage.getItem(KEY));
    } catch {
      setName(null);
    }
    setReady(true);
  }, []);

  const save = (value: string) => {
    const clean = value.trim().slice(0, 50);
    if (!clean) return;
    try {
      localStorage.setItem(KEY, clean);
    } catch {
      /* ignore */
    }
    setName(clean);
  };

  return { name, ready, save };
}
