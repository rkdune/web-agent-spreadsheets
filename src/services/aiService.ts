interface FillCellRequest {
  prompt: string;
  context: Record<string, string>;
  columnKey: string;
  rowData: Record<string, string>;
}

interface FillCellResponse {
  value: string;
  source: string;
  success: boolean;
  error?: string;
}

class AIService {
  private baseUrl = '/api';

  async fillCell(
    prompt: string,
    context: Record<string, string>,
    columnKey: string,
    rowData: Record<string, string>
  ): Promise<FillCellResponse> {
    const requestBody: FillCellRequest = {
      prompt,
      context,
      columnKey,
      rowData
    };

    try {
      const response = await fetch(`${this.baseUrl}/fill-cell`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data: FillCellResponse = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('AI Service Error:', error);
      
      if (error instanceof Error) {
        return {
          value: '',
          source: '',
          success: false,
          error: error.message
        };
      }

      return {
        value: '',
        source: '',
        success: false,
        error: 'Unknown error occurred'
      };
    }
  }

  async fillCellWithRetry(
    prompt: string,
    context: Record<string, string>,
    columnKey: string,
    rowData: Record<string, string>,
    maxRetries: number = 2
  ): Promise<FillCellResponse> {
    let lastError: string = '';

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.fillCell(prompt, context, columnKey, rowData);
        
        if (result.success) {
          return result;
        }
        
        lastError = result.error || 'Unknown error';
        
        // Don't retry on certain errors
        if (result.error?.includes('API key') || result.error?.includes('quota')) {
          break;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    return {
      value: '',
      source: '',
      success: false,
      error: `Failed after ${maxRetries + 1} attempts: ${lastError}`
    };
  }

  // Helper method to extract context from a row
  extractContext(rowData: Record<string, { value: string }>, excludeColumn?: string): Record<string, string> {
    const context: Record<string, string> = {};
    
    Object.entries(rowData).forEach(([key, cell]) => {
      if (key !== excludeColumn && cell?.value && typeof cell.value === 'string' && cell.value.trim() !== '') {
        // Convert column IDs to readable names
        const readableName = this.getReadableColumnName(key);
        context[readableName] = cell.value;
      }
    });
    
    return context;
  }

  private getReadableColumnName(columnId: string): string {
    const nameMap: Record<string, string> = {
      'company': 'Company Name',
      'website': 'Website',
      'email': 'Email',
      'phone': 'Phone',
      'source': 'Source',
      'competitive': 'Competitive Analysis',
      'risk': 'Risk Assessment'
    };
    
    return nameMap[columnId] || columnId;
  }
}

export const aiService = new AIService(); 