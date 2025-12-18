import type { TowerCardData, ChatServiceResponse } from '../types/chat';

// Use the Chat Trigger URL which automatically handles CORS and chat formatting
const CHAT_WEBHOOK_URL = 'https://n8n.sproutify.app/webhook/269f750d-85dd-49b8-bb9f-aa7c1d19d0f0/chat';
const SESSION_ID_KEY = 'sage_chat_session_id';

// Re-export types for convenience
export type { TowerCardData, ChatServiceResponse };

class AiChatService {
  private sessionId: string | null = null;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    try {
      const stored = localStorage.getItem(SESSION_ID_KEY);
      if (stored) {
        return stored;
      }
      const newId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(SESSION_ID_KEY, newId);
      return newId;
    } catch {
      // Fallback if localStorage fails
      return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }

  async sendMessage(
    message: string,
    farmId?: string,
    farmName?: string,
    userEmail?: string
  ): Promise<ChatServiceResponse> {
    try {
      // Ensure we have a session ID
      const sessionId = this.sessionId || this.getOrCreateSessionId();

      // Send farm context in the payload (matches mobile app format)
      // The Chat Trigger workflow needs farm_id to query Supabase correctly
      const payload = [{
        message,
        farmId: farmId || '',
        farmName: farmName || 'My Farm',
        userEmail: userEmail || '',
        sessionId,
      }];

      const response = await fetch(CHAT_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Handle array response from n8n Chat Trigger (matches mobile app)
      const responseData = Array.isArray(data) ? data[0] : data;
      
      // Parse response - handles both plain text and JSON with cards
      return this.parseResponse(responseData);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      // Provide more helpful error messages
      if (error.message?.includes('CORS') || error.message?.includes('Failed to fetch')) {
        throw new Error('Unable to connect to Sage. Please check your network connection or contact support if the issue persists.');
      }
      
      throw error;
    }
  }

  private parseResponse(data: any): ChatServiceResponse {
    let content = '';
    
    // Check if the data already has the correct response structure
    if (data.created && data.choices) {
      content = data.choices[0]?.message?.content || 'No response available';
    } else if (data.output) {
      // If it's from AI Agent (has output field)
      content = data.output;
    } else if (data.response) {
      // Simple response format
      content = data.response;
    } else {
      // Fallback
      content = 'No output available';
    }

    // Try to parse the content as JSON
    try {
      const parsed = JSON.parse(content);
      
      // Check if it's a structured JSON response with text and data.cards
      if (parsed && typeof parsed === 'object' && 'text' in parsed) {
        return {
          message: parsed.text || content,
          reportHtml: parsed.reportHtml,
          cards: parsed.data?.cards || undefined,
        };
      }
    } catch {
      // Not JSON, treat as plain text
    }

    // Return as plain text if parsing fails or doesn't match structure
    return {
      message: content,
    };
  }
}

export const aiChatService = new AiChatService();




