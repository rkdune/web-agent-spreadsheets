import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

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

export async function POST(request: NextRequest): Promise<NextResponse<FillCellResponse>> {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY || !openai) {
      return NextResponse.json(
        { 
          value: '', 
          source: '', 
          success: false, 
          error: 'OpenAI API key not configured' 
        },
        { status: 500 }
      );
    }

    const body: FillCellRequest = await request.json();
    const { prompt, context, columnKey } = body;

    // Validate required fields
    if (!prompt || !columnKey) {
      return NextResponse.json(
        { 
          value: '', 
          source: '', 
          success: false, 
          error: 'Missing required fields: prompt and columnKey' 
        },
        { status: 400 }
      );
    }

    // Build context-aware prompt
    const contextInfo = Object.entries(context)
      .filter(([, value]) => value && value.trim() !== '')
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const systemPrompt = `You are a business research assistant helping to fill spreadsheet cells with accurate information about companies.

INSTRUCTIONS:
1. Research the requested information based on the prompt and context provided
2. Return ONLY the specific information requested - no explanations or additional text
3. If you cannot find the information, return "Not Found"
4. For websites: Return the full URL (including https://)
5. For emails: Return a valid business email address
6. For phone numbers: Return in standard format (e.g., 1-800-555-0123)
7. For analysis: Provide concise, factual business insights

CONTEXT ABOUT THIS COMPANY:
${contextInfo || 'No additional context provided'}

TASK: ${prompt}

Return only the requested information, nothing else.`;

    // Make OpenAI API call
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Please find the information requested for this company.`
        }
      ],
      max_tokens: 500,
      temperature: 0.1, // Low temperature for more consistent, factual responses
    });

    const aiResponse = completion.choices[0]?.message?.content?.trim() || 'Not Found';

    // Generate source description
    const sourceDescription = contextInfo 
      ? `AI research based on company context: ${Object.keys(context).join(', ')}`
      : 'AI research based on prompt instructions';

    return NextResponse.json({
      value: aiResponse,
      source: sourceDescription,
      success: true
    });

  } catch (error) {
    console.error('OpenAI API Error:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof Error) {
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { 
            value: '', 
            source: '', 
            success: false, 
            error: 'Invalid API key' 
          },
          { status: 401 }
        );
      }
      
      if (error.message.includes('quota')) {
        return NextResponse.json(
          { 
            value: '', 
            source: '', 
            success: false, 
            error: 'API quota exceeded' 
          },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { 
        value: '', 
        source: '', 
        success: false, 
        error: 'Failed to generate content' 
      },
      { status: 500 }
    );
  }
} 