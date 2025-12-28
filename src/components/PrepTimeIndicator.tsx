import { useEffect, useState } from "react";
import { Clock, AlertTriangle, CheckCircle, Timer } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface PrepTimeIndicatorProps {
  estimatedMinutes: number;
  startTime: string;
  className?: string;
}

export function PrepTimeIndicator({ estimatedMinutes, startTime, className = "" }: PrepTimeIndicatorProps) {
  const [elapsedMinutes, setElapsedMinutes] = useState(0);

  useEffect(() => {
    const calculateElapsed = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diffMinutes = Math.floor((now - start) / 60000);
      setElapsedMinutes(diffMinutes);
    };

    calculateElapsed();
    const interval = setInterval(calculateElapsed, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [startTime]);

  const percentage = estimatedMinutes > 0 
    ? Math.min((elapsedMinutes / estimatedMinutes) * 100, 100)
    : 0;

  const isOvertime = elapsedMinutes > estimatedMinutes;
  const overtimeMinutes = isOvertime ? elapsedMinutes - estimatedMinutes : 0;
  const isNearLimit = !isOvertime && percentage >= 80;
  const isOnTrack = percentage < 80;

  const getStatusColor = () => {
    if (isOvertime) return "text-red-600";
    if (isNearLimit) return "text-amber-600";
    return "text-green-600";
  };

  const getProgressColor = () => {
    if (isOvertime) return "bg-red-500";
    if (isNearLimit) return "bg-amber-500";
    return "bg-green-500";
  };

  const getBackgroundColor = () => {
    if (isOvertime) return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
    if (isNearLimit) return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
  };

  const getIcon = () => {
    if (isOvertime) return <AlertTriangle className="h-5 w-5 text-red-600" />;
    if (isNearLimit) return <Timer className="h-5 w-5 text-amber-600 animate-pulse" />;
    return <Clock className="h-5 w-5 text-green-600" />;
  };

  return (
    <div className={`p-3 rounded-xl border ${getBackgroundColor()} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {getIcon()}
          <span className={`font-bold ${getStatusColor()}`}>
            {isOvertime ? (
              <>+{overtimeMinutes}min atrasado</>
            ) : (
              <>{elapsedMinutes}min / {estimatedMinutes}min</>
            )}
          </span>
        </div>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {isOvertime ? "ATRASADO" : isNearLimit ? "ATENÇÃO" : "NO PRAZO"}
        </span>
      </div>
      
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${getProgressColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
        {isOvertime && (
          <div 
            className="absolute top-0 right-0 h-full bg-red-600 animate-pulse"
            style={{ width: `${Math.min((overtimeMinutes / estimatedMinutes) * 100, 50)}%` }}
          />
        )}
      </div>
      
      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
        <span>Início</span>
        <span>Estimado: {estimatedMinutes}min</span>
      </div>
    </div>
  );
}
