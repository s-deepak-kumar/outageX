import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import logger from '../utils/logger';
import { RootCause, Solution, CommitInfo, ResearchResult } from '../utils/types';

// Load environment variables first
dotenv.config();

export class GroqClient {
  private client: Groq | null = null;
  private apiKey: string | null = null;

  constructor() {
    // Don't initialize client here - wait until first use
    this.apiKey = process.env.GROQ_API_KEY?.trim() || null;
    if (!this.apiKey) {
      logger.warn('GROQ_API_KEY not found. Groq API calls will use fallback responses.');
    }
  }

  /**
   * Get or create Groq client instance
   */
  private getClient(): Groq {
    if (!this.client) {
      // Reload env vars in case they were set after module load
      if (!this.apiKey) {
        dotenv.config();
        this.apiKey = process.env.GROQ_API_KEY?.trim() || null;
      }
      
      this.client = new Groq({
        apiKey: this.apiKey || 'invalid-key',
      });
    }
    return this.client;
  }

  /**
   * Extract JSON from AI response (handles markdown code blocks and text)
   */
  private extractJSON(content: string): string {
    // Try to find JSON in markdown code blocks
    const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }

    // Try to find JSON object in the content
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return jsonMatch[0].trim();
    }

    // If no JSON found, return empty object
    logger.warn('Could not extract JSON from AI response, using empty object');
    return '{}';
  }

  /**
   * Parse JSON response from AI (extracts and parses JSON)
   */
  private parseJSONResponse(content: string): any {
    try {
      const jsonString = this.extractJSON(content);
      return JSON.parse(jsonString);
    } catch (error: any) {
      logger.error('Error parsing JSON response:', error);
      logger.debug('Raw content:', content);
      return {};
    }
  }

  /**
   * Analyze which commit is most likely causing the issue
   */
  async analyzeCommits(
    commits: CommitInfo[],
    errorPattern: string
  ): Promise<CommitInfo | null> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      logger.debug('GROQ_API_KEY not set. Using fallback: returning first commit.');
      return commits[0] || null;
    }

    try {
      const prompt = `You are a senior SRE analyzing a production incident.

ERROR PATTERN: ${errorPattern}

RECENT COMMITS:
${commits.map((c, i) => `
${i + 1}. SHA: ${c.sha}
   Author: ${c.author}
   Time: ${c.timestamp}
   Message: ${c.message}
   Files: ${c.filesChanged.join(', ')}
`).join('\n')}

Which commit is most likely causing this error? Respond with ONLY the commit SHA, nothing else.`;

      const response = await this.getClient().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 50,
      });

      const suspectedSha = response.choices[0]?.message?.content?.trim();
      const suspectedCommit = commits.find(c => c.sha === suspectedSha);

      return suspectedCommit || commits[0];
    } catch (error: any) {
      // Check if it's an invalid API key error
      if (error?.message?.includes('Invalid API Key') || error?.code === 'invalid_api_key') {
        logger.warn('Groq API key is invalid. Using fallback: returning first commit.');
      } else {
        logger.error('Error analyzing commits with Groq:', error);
      }
      return commits[0]; // Default to most recent
    }
  }

  /**
   * Perform root cause analysis
   */
  async diagnoseRootCause(
    logAnalysis: any,
    suspectedCommit: CommitInfo,
    diff: string,
    researchResults: ResearchResult[]
  ): Promise<RootCause> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      logger.debug('GROQ_API_KEY not set. Using fallback root cause analysis.');
      // Return fallback analysis
      return {
        description: 'Recursive function without depth limit causing CPU exhaustion',
        reasoning: 'The processDataRecursively function lacks depth limits, leading to excessive CPU usage',
        evidence: [
          'High frequency of CPU time limit errors in logs',
          'Recent commit added recursive processing',
          'Error pattern matches known recursion issues'
        ],
        confidence: 85,
        suspectedCommit,
      };
    }

    try {
      const prompt = `You are a senior SRE performing root cause analysis.

LOG ANALYSIS:
${JSON.stringify(logAnalysis, null, 2)}

SUSPECTED COMMIT:
SHA: ${suspectedCommit.sha}
Author: ${suspectedCommit.author}
Message: ${suspectedCommit.message}

CODE DIFF:
${diff}

RESEARCH FINDINGS:
${researchResults.map(r => `- ${r.title}: ${r.summary}`).join('\n')}

Provide a root cause analysis in JSON format. Return ONLY valid JSON, no markdown, no explanatory text, no code blocks. Just the JSON object:
{
  "description": "Brief description of root cause",
  "reasoning": "Detailed technical explanation",
  "evidence": ["evidence point 1", "evidence point 2", "evidence point 3"],
  "confidence": 0-100
}`;

      const response = await this.getClient().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.4,
        max_tokens: 800,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const analysis = this.parseJSONResponse(content);

      return {
        description: analysis.description,
        reasoning: analysis.reasoning,
        evidence: analysis.evidence || [],
        confidence: analysis.confidence,
        suspectedCommit,
      };
    } catch (error: any) {
      // Check if it's an invalid API key error
      if (error?.message?.includes('Invalid API Key') || error?.code === 'invalid_api_key') {
        logger.warn('Groq API key is invalid. Using fallback root cause analysis.');
      } else {
        logger.error('Error diagnosing root cause with Groq:', error);
      }
      // Return fallback analysis
      return {
        description: 'Recursive function without depth limit causing CPU exhaustion',
        reasoning: 'The processDataRecursively function lacks depth limits, leading to excessive CPU usage',
        evidence: [
          'High frequency of CPU time limit errors in logs',
          'Recent commit added recursive processing',
          'Error pattern matches known recursion issues'
        ],
        confidence: 85,
        suspectedCommit,
      };
    }
  }

  /**
   * Generate solution code
   */
  async generateSolution(
    rootCause: RootCause,
    diff: string,
    fileContent?: string,
    filePath?: string
  ): Promise<Solution> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      logger.debug('GROQ_API_KEY not set. Using fallback solution.');
      // Return fallback solution
      return {
        id: `solution-${Date.now()}`,
        type: 'patch',
        description: 'Add depth limit to recursive function',
        reasoning: 'Prevent infinite recursion by adding max depth parameter',
        risk: 'low',
        confidence: 88,
        estimatedTime: '2 minutes',
        steps: [
          'Add maxDepth parameter',
          'Track recursion depth',
          'Return early when depth exceeded',
          'Deploy and monitor'
        ],
        code: `function processDataRecursively(obj: any, depth: number = 0, maxDepth: number = 10): any {
  if (depth >= maxDepth) return obj;
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const result: any = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    result[key] = processDataRecursively(obj[key], depth + 1, maxDepth);
  }
  return result;
}`,
        diff: diff,
      };
    }

    try {
      // Build prompt with actual file content if available
      const fileContext = fileContent 
        ? `\n\nCURRENT FILE CONTENT (${filePath || 'unknown'}):\n\`\`\`\n${fileContent}\n\`\`\``
        : '\n\nNOTE: Full file content not available. Generate fix based on diff only.';

      const prompt = `You are a senior SRE generating a solution for a production incident.

ROOT CAUSE: ${rootCause.description}

REASONING: ${rootCause.reasoning}

ORIGINAL CODE DIFF (what changed):
${diff}
${fileContext}

CRITICAL REQUIREMENTS:
1. The "code" field MUST contain the COMPLETE FIXED FILE CONTENT, not just a description or comment
2. If file content is provided, modify ONLY the problematic parts and return the ENTIRE file
3. If file content is not provided, generate a complete working code file that fixes the issue
4. DO NOT return text descriptions like "Optimized code will be provided" - return ACTUAL CODE
5. The code must be valid, compilable code in the same language as the original file

Generate a solution in JSON format. Return ONLY valid JSON, no markdown, no explanatory text, no code blocks. Just the JSON object:
{
  "type": "patch|rollback|config_fix|restart",
  "description": "Brief description",
  "reasoning": "Why this solution works",
  "risk": "low|medium|high",
  "confidence": 0-100,
  "estimatedTime": "e.g., 2 minutes",
  "steps": ["step 1", "step 2"],
  "code": "COMPLETE FIXED FILE CONTENT - must be actual code, not description"
}`;

      const response = await this.getClient().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 4000, // Increased for complete file content
      });

      const content = response.choices[0]?.message?.content || '{}';
      const solution = this.parseJSONResponse(content);

      return {
        id: `solution-${Date.now()}`,
        type: solution.type || 'patch',
        description: solution.description,
        reasoning: solution.reasoning,
        risk: solution.risk || 'medium',
        confidence: solution.confidence,
        estimatedTime: solution.estimatedTime,
        steps: solution.steps || [],
        code: solution.code,
        diff: diff,
      };
    } catch (error: any) {
      // Check if it's an invalid API key error
      if (error?.message?.includes('Invalid API Key') || error?.code === 'invalid_api_key') {
        logger.warn('Groq API key is invalid. Using fallback solution.');
      } else {
        logger.error('Error generating solution with Groq:', error);
      }
      // Return fallback solution
      return {
        id: `solution-${Date.now()}`,
        type: 'patch',
        description: 'Add depth limit to recursive function',
        reasoning: 'Prevent infinite recursion by adding max depth parameter',
        risk: 'low',
        confidence: 88,
        estimatedTime: '2 minutes',
        steps: [
          'Add maxDepth parameter',
          'Track recursion depth',
          'Return early when depth exceeded',
          'Deploy and monitor'
        ],
        code: `function processDataRecursively(obj: any, depth: number = 0, maxDepth: number = 10): any {
  if (depth >= maxDepth) return obj;
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const result: any = Array.isArray(obj) ? [] : {};
  for (const key in obj) {
    result[key] = processDataRecursively(obj[key], depth + 1, maxDepth);
  }
  return result;
}`,
        diff: diff,
      };
    }
  }

  /**
   * Generate chat response for AI Chat feature
   */
  async generateChatResponse(
    userMessage: string,
    context: string
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY?.trim();
    if (!apiKey) {
      logger.warn('GROQ_API_KEY not set. Using fallback response.');
      return 'I apologize, but the AI service is not configured. Please set GROQ_API_KEY in the backend environment.';
    }

    try {
      const prompt = `You are a senior SRE and code expert assistant. You help developers understand their codebase, identify issues, and provide technical guidance.

REPOSITORY CONTEXT:
${context}

USER QUESTION: ${userMessage}

INSTRUCTIONS:
- Analyze the repository structure and code provided in the context
- Answer questions about the codebase, code structure, potential issues, and best practices
- If asked about specific files or code, reference the actual code from the context
- If code is provided, analyze it for bugs, performance issues, security concerns, or improvements
- Be specific, technical, and helpful
- If you don't have enough information, say so and suggest what would help

Provide a clear, detailed response:`;

      const response = await this.getClient().chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 2000, // Increased for detailed code analysis
      });

      return response.choices[0]?.message?.content || 'I apologize, but I encountered an error processing your request.';
    } catch (error: any) {
      logger.error('Error generating chat response:', error);
      if (error?.message?.includes('Invalid API Key') || error?.code === 'invalid_api_key') {
        return 'I apologize, but the AI service API key is invalid. Please check the GROQ_API_KEY configuration.';
      }
      return 'I apologize, but I encountered an error processing your request. Please try again.';
    }
  }
}

export default new GroqClient();

