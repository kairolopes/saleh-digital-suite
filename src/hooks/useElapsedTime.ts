import { useState, useEffect } from "react";

export function useElapsedTime(refreshInterval = 1000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick((prev) => prev + 1);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval]);

  const getElapsedTime = (dateStr: string): string => {
    const start = new Date(dateStr).getTime();
    const now = Date.now();
    const diffMs = now - start;

    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}min`;
    }

    return `${minutes}min`;
  };

  const getElapsedMinutes = (dateStr: string): number => {
    const start = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.floor((now - start) / 60000);
  };

  const getUrgencyColor = (dateStr: string): string => {
    const minutes = getElapsedMinutes(dateStr);
    if (minutes >= 30) return "text-red-600 bg-red-100 dark:bg-red-900/30";
    if (minutes >= 15) return "text-orange-600 bg-orange-100 dark:bg-orange-900/30";
    if (minutes >= 10) return "text-amber-600 bg-amber-100 dark:bg-amber-900/30";
    return "text-muted-foreground bg-muted/50";
  };

  return { getElapsedTime, getElapsedMinutes, getUrgencyColor };
}
