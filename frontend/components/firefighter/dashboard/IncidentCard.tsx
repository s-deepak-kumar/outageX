'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '../shared/StatusBadge';
import { useFirefighterStore } from '@/store/firefighter';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Clock, Server } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function IncidentCard() {
  const incident = useFirefighterStore((state) => state.incident);
  const [duration, setDuration] = useState<string>('');

  useEffect(() => {
    if (!incident?.startedAt) return;

    const updateDuration = () => {
      const start = new Date(incident.startedAt);
      setDuration(formatDistanceToNow(start, { addSuffix: false }));
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [incident?.startedAt]);

  if (!incident) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            No Active Incident
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            System is nominal. Trigger an incident to start the demo.
          </p>
        </CardContent>
      </Card>
    );
  }

  const severityVariants = {
    critical: 'destructive',
    high: 'destructive',
    medium: 'secondary',
    low: 'outline',
  } as const;

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="relative">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <CardTitle className="text-xl">Active Incident</CardTitle>
          </div>
          <StatusBadge status={incident.status} />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={severityVariants[incident.severity]}>
            {incident.severity.toUpperCase()}
          </Badge>
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {duration}
          </div>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-4">
        <div>
          <h3 className="font-semibold text-lg mb-1">{incident.title}</h3>
          <p className="text-sm text-muted-foreground">{incident.description}</p>
        </div>

        {incident.affectedServices.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2 text-sm font-medium">
              <Server className="h-4 w-4" />
              Affected Services
            </div>
            <div className="flex flex-wrap gap-2">
              {incident.affectedServices.map((service, index) => (
                <Badge
                  key={index}
                  variant="outline"
                >
                  {service}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {incident.resolvedAt && (
          <div className="text-sm text-green-600 dark:text-green-400">
            ✓ Resolved {formatDistanceToNow(new Date(incident.resolvedAt), { addSuffix: true })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

