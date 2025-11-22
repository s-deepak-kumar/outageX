'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useFirefighterStore } from '@/store/firefighter';
import { Activity, Cpu, Database, Gauge, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SystemHealth() {
  const metrics = useFirefighterStore((state) => state.metrics);
  const incident = useFirefighterStore((state) => state.incident);

  const getStatusColor = (value: number, isError: boolean = false) => {
    if (isError) {
      // For error rates, lower is better
      if (value < 5) return 'text-green-600 dark:text-green-400';
      if (value < 15) return 'text-yellow-600 dark:text-yellow-400';
      return 'text-destructive';
    } else {
      // For resource usage, lower is better
      if (value < 60) return 'text-green-600 dark:text-green-400';
      if (value < 80) return 'text-yellow-600 dark:text-yellow-400';
      return 'text-destructive';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CPU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>CPU Usage</span>
            </div>
            <span className={cn('font-mono font-semibold', getStatusColor(metrics.cpu))}>
              {metrics.cpu}%
            </span>
          </div>
          <Progress value={metrics.cpu} className="h-2" />
        </div>

        {/* Memory */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>Memory</span>
            </div>
            <span className={cn('font-mono font-semibold', getStatusColor(metrics.memory))}>
              {metrics.memory}%
            </span>
          </div>
          <Progress value={metrics.memory} className="h-2" />
        </div>

        {/* Error Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-destructive" />
              <span>Error Rate</span>
            </div>
            <span className={cn('font-mono font-semibold', getStatusColor(metrics.errorRate, true))}>
              {metrics.errorRate.toFixed(1)}%
            </span>
          </div>
          <Progress value={Math.min(metrics.errorRate, 100)} className="h-2" />
        </div>

        {/* Request Rate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <span>Requests/sec</span>
            </div>
            <span className="font-mono font-semibold">
              {metrics.requestRate.toLocaleString()}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Avg latency: {metrics.latency}ms
          </div>
        </div>

        {/* Overall Status */}
        <div className="pt-3 border-t">
          <div
            className={cn(
              'text-center py-2 rounded-lg font-medium text-sm',
              incident && incident.status !== 'resolved'
                ? 'bg-destructive/10 text-destructive'
                : 'bg-green-500/10 text-green-600 dark:text-green-400'
            )}
          >
            {incident && incident.status !== 'resolved' ? '⚠️ Degraded' : '✓ All Systems Operational'}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

