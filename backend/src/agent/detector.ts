import { Incident } from '../utils/types';
import { mockIncident } from '../data/mock-scenarios';
import logger from '../utils/logger';

/**
 * Incident Detector
 * 
 * Detects and classifies incidents.
 * In production, this would integrate with monitoring systems.
 * For demo, we trigger manually.
 */
export class IncidentDetector {
  private metadata: Record<string, any> | null = null;

  /**
   * Set metadata from runtime error or webhook
   */
  setMetadata(metadata: Record<string, any>): void {
    this.metadata = metadata;
  }

  /**
   * Detect incident from runtime errors or manually triggered
   */
  async detectIncident(): Promise<Incident> {
    logger.info('Incident detected!', this.metadata || {});
    
    // If metadata is provided (from runtime monitor or webhook), use it
    if (this.metadata) {
      const { source, projectName, errorMessage, errorCount, errors } = this.metadata;
      
      // Create incident from runtime error
      const incident: Incident = {
        id: `inc-${Date.now()}`,
        title: errorMessage || 'Runtime Error Detected',
        description: source === 'runtime_monitor' 
          ? `Detected ${errorCount} runtime errors in project ${projectName}. Errors are occurring in production.`
          : errorMessage || 'An error occurred in production',
        severity: this.classifySeverity(errorCount || 1, 1),
        status: 'detecting',
        affectedServices: [projectName || 'unknown'],
        startedAt: new Date(),
      };

      return incident;
    }
    
    // Fallback to mock incident for manual triggers
    return {
      ...mockIncident,
      startedAt: new Date(),
    };
  }

  /**
   * Classify incident severity
   */
  classifySeverity(errorRate: number, affectedServices: number): 'critical' | 'high' | 'medium' | 'low' {
    if (errorRate > 50 || affectedServices > 5) {
      return 'critical';
    } else if (errorRate > 25 || affectedServices > 2) {
      return 'high';
    } else if (errorRate > 10 || affectedServices > 1) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Get affected services
   */
  async getAffectedServices(incident: Incident): Promise<string[]> {
    // In production, query service mesh, load balancers, etc.
    return incident.affectedServices;
  }
}

export default new IncidentDetector();

