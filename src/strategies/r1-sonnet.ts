import { BaseStrategy } from './base.js';
import { ReasoningRequest, ReasoningResponse } from '../types.js';

interface R1Response {
  choices: [{
    message: {
      content: string;
    }
  }];
}

export class R1SonnetStrategy extends BaseStrategy {
  private apiKey: string;
  private siteUrl: string;
  private siteName: string;

  constructor(stateManager: any, config?: { 
    apiKey?: string;
    siteUrl?: string;
    siteName?: string;
  }) {
    super(stateManager);
    this.apiKey = config?.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.siteUrl = config?.siteUrl || process.env.SITE_URL || '';
    this.siteName = config?.siteName || process.env.SITE_NAME || '';
  }

  private formatErrorMessage(error: any): string {
    if (error.name === 'AbortError') {
      return 'The request timed out. The model is taking too long to respond.';
    }
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      return 'Network error. Please check your internet connection.';
    }
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return 'Invalid or missing API key. Please check your OPENROUTER_API_KEY environment variable.';
      }
      return error.message;
    }
    return 'An unexpected error occurred while calling the R1 API.';
  }

  public async getR1Response(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is not set');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

      console.log('Sending request to OpenRouter API...');
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "HTTP-Referer": this.siteUrl,
          "X-Title": this.siteName,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "deepseek/deepseek-r1",
          "messages": [
            {
              "role": "user",
              "content": prompt
            }
          ],
          "stream": false,
          "max_tokens": 4096
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('Received response from OpenRouter API');

      const responseText = await response.text();
      console.log('Raw response:', responseText);

      if (!response.ok) {
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.error?.message || `API returned status ${response.status}`);
        } catch (e) {
          throw new Error(`API returned status ${response.status}: ${responseText}`);
        }
      }

      let data: R1Response;
      try {
        data = JSON.parse(responseText) as R1Response;
        console.log('Parsed response data:', data);
      } catch (e) {
        console.error('Failed to parse response JSON:', e);
        throw new Error('Failed to parse API response as JSON');
      }
      
      if (!data.choices?.[0]?.message?.content) {
        console.error('Invalid response format:', data);
        throw new Error('Received invalid response format from API');
      }

      const content = data.choices[0].message.content;
      console.log('Successfully extracted content:', content);
      return content;
    } catch (error) {
      const friendlyMessage = this.formatErrorMessage(error);
      console.error('Error calling R1 API:', error);
      throw new Error(friendlyMessage);
    }
  }


  // Keep this method to satisfy the BaseStrategy interface
  async processThought(request: any): Promise<any> {
    const response = await this.getR1Response(request.thought);
    return {
      nodeId: `r1-${Date.now()}`,
      thought: response,
      score: 1,
      depth: 1,
      isComplete: true,
      nextThoughtNeeded: false,
      strategyUsed: 'r1_sonnet'
    };
  }
}
