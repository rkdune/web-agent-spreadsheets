import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

interface AssessComplexityRequest {
  prompt: string;
}

interface AssessComplexityResponse {
  complexity: 'simple' | 'medium' | 'complex';
  reasoning?: string;
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<AssessComplexityResponse>> {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY || !openai) {
      return NextResponse.json(
        { 
          complexity: 'medium' as const,
          success: false, 
          error: 'OpenAI API key not configured' 
        },
        { status: 500 }
      );
    }

    const body: AssessComplexityRequest = await request.json();
    const { prompt } = body;

    // Validate required fields
    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { 
          complexity: 'medium' as const,
          success: false, 
          error: 'Prompt is required' 
        },
        { status: 400 }
      );
    }

    const systemPrompt = `You are an AI task complexity analyzer. Analyze the given prompt and classify it as "simple", "medium", or "complex" based on these criteria:

SIMPLE tasks:
- Basic data lookup (finding emails, phone numbers, websites)
- Simple factual retrieval (company founding year, location)
- Standard contact information research
- Straightforward web searches with clear answers

MEDIUM tasks:
- Research requiring multiple sources or verification
- Analysis of basic business information
- Finding specific but commonly available data
- Tasks requiring some interpretation or synthesis

COMPLEX tasks:
- Deep analysis or complex reasoning
- Research requiring expert knowledge
- Multi-step analysis with dependencies
- Creative or subjective tasks
- Tasks requiring advanced reasoning or specialized knowledge
- Financial analysis, strategic planning, technical assessments

Respond with only ONE word: "simple", "medium", or "complex". No explanations.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: `Analyze this prompt: "${prompt}"`
          }
        ],
        temperature: 0.1,
        max_tokens: 10
      });

      const aiResponse = response.choices[0]?.message?.content?.trim().toLowerCase();
      
      // Validate response
      let complexity: 'simple' | 'medium' | 'complex';
      if (aiResponse === 'simple' || aiResponse === 'medium' || aiResponse === 'complex') {
        complexity = aiResponse;
      } else {
        console.warn('Invalid complexity response:', aiResponse);
        complexity = 'medium'; // Default fallback
      }

      return NextResponse.json({
        complexity,
        success: true
      });

    } catch (apiError) {
      console.error('OpenAI API Error:', apiError);
      
      // Handle specific OpenAI errors
      if (apiError instanceof Error) {
        if (apiError.message.includes('API key')) {
          return NextResponse.json(
            { 
              complexity: 'medium' as const,
              success: false, 
              error: 'Invalid API key' 
            },
            { status: 401 }
          );
        }
        
        if (apiError.message.includes('quota')) {
          return NextResponse.json(
            { 
              complexity: 'medium' as const,
              success: false, 
              error: 'API quota exceeded' 
            },
            { status: 429 }
          );
        }
      }

      return NextResponse.json(
        { 
          complexity: 'medium' as const,
          success: false, 
          error: 'Failed to assess complexity' 
        },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Complexity Assessment Error:', error);
    
    return NextResponse.json(
      { 
        complexity: 'medium' as const,
        success: false, 
        error: 'Failed to assess complexity' 
      },
      { status: 500 }
    );
  }
} 