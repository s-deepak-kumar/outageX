import logger from '../utils/logger';
import { LogEntry } from '../utils/types';
import { mockLogs } from '../data/mock-scenarios';

/**
 * Log Analyzer
 * 
 * Analyzes logs using E2B sandbox with Python scripts.
 * Identifies patterns, errors, and anomalies.
 */
export class LogAnalyzer {
  /**
   * Fetch logs from affected services
   */
  async fetchLogs(services: string[], _timeRange: number = 3600000): Promise<LogEntry[]> {
    logger.info(`Fetching logs for services: ${services.join(', ')}`);
    
    // In production, this would query:
    // - Elasticsearch
    // - CloudWatch
    // - Datadog
    // - Splunk
    // etc.
    
    return mockLogs;
  }

  /**
   * Analyze logs using pattern detection
   */
  async analyzeLogs(logs: LogEntry[]): Promise<any> {
    logger.info('Analyzing logs with pattern detection...');
    
    // Perform comprehensive log analysis
    const errorCount = logs.filter(l => l.level === 'error').length;
    const errorRate = (errorCount / logs.length) * 100;
    const mostCommonErrors = this.getMostCommonErrors(logs);
    const affectedServices = [...new Set(logs.map(l => l.service))];

    const analysis = {
      total_logs: logs.length,
      error_count: errorCount,
      error_rate: errorRate.toFixed(2),
      most_common_errors: mostCommonErrors,
      affected_services: affectedServices,
      analysis: `Detected ${errorCount} errors across ${affectedServices.length} services. Error rate: ${errorRate.toFixed(1)}%.`,
      anomalies: this.detectAnomalies(logs),
    };
    
    logger.info('Log analysis complete:', analysis);
    return analysis;
  }

  /**
   * Identify error patterns
   */
  private getMostCommonErrors(logs: LogEntry[]): Array<{ message: string; count: number }> {
    const errorCounts = new Map<string, number>();
    
    logs
      .filter(l => l.level === 'error')
      .forEach(log => {
        const count = errorCounts.get(log.message) || 0;
        errorCounts.set(log.message, count + 1);
      });

    return Array.from(errorCounts.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  /**
   * Detect anomalies in log patterns
   */
  detectAnomalies(logs: LogEntry[]): Array<{ type: string; description: string }> {
    const anomalies: Array<{ type: string; description: string }> = [];

    // Check for error spikes
    const errorRate = (logs.filter(l => l.level === 'error').length / logs.length) * 100;
    if (errorRate > 50) {
      anomalies.push({
        type: 'error_spike',
        description: `High error rate detected: ${errorRate.toFixed(1)}%`,
      });
    }

    // Check for repeated errors
    const errorPatterns = this.getMostCommonErrors(logs);
    const topError = errorPatterns[0];
    if (topError && topError.count > logs.length * 0.3) {
      anomalies.push({
        type: 'repeated_error',
        description: `Same error repeated ${topError.count} times: "${topError.message}"`,
      });
    }

    return anomalies;
  }

  /**
   * Extract key insights from logs
   */
  extractInsights(_logs: LogEntry[], analysis: any): string[] {
    const insights: string[] = [];

    insights.push(`Analyzed ${analysis.total_logs} log entries with ${analysis.error_rate}% error rate`);

    if (analysis.most_common_errors && analysis.most_common_errors.length > 0) {
      const topError = analysis.most_common_errors[0];
      insights.push(`Most frequent error: "${topError.message}" (${topError.count} occurrences)`);
    }

    if (analysis.analysis) {
      insights.push(analysis.analysis);
    }

    return insights;
  }
}

export default new LogAnalyzer();

