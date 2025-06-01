import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

interface CompareRequest {
  result1: string;
  result2: string;
}

interface CompareResponse {
  match: boolean;
  confidence: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<CompareResponse>> {
  try {
    // Check if API key is configured
    if (!process.env.OPENAI_API_KEY || !openai) {
      return NextResponse.json(
        { match: false, confidence: 0 },
        { status: 500 }
      );
    }

    const body: CompareRequest = await request.json();
    const { result1, result2 } = body;

    // If either result is empty or "Not Found", they only match if both are
    if (!result1 || result1.trim() === '' || result1 === 'Not Found' ||
        !result2 || result2.trim() === '' || result2 === 'Not Found') {
      const bothEmpty = (!result1 || result1.trim() === '' || result1 === 'Not Found') &&
                       (!result2 || result2.trim() === '' || result2 === 'Not Found');
      return NextResponse.json({
        match: bothEmpty,
        confidence: bothEmpty ? 100 : 0
      });
    }

    // Use GPT-3.5-turbo for fast, cheap comparison
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: `You are comparing two AI-generated results to determine if they contain essentially the same information.

INSTRUCTIONS:
1. Compare the semantic meaning and factual content of both results
2. Ignore minor formatting differences, extra words, or slight variations in phrasing
3. Focus on whether the core information is the same
4. For URLs: Consider them matching if they point to the same domain/company
5. For emails: Consider them matching if they're from the same domain or clearly the same contact
6. For phone numbers: Consider them matching if they're the same number (ignore formatting)
7. For company names: Consider variations of the same company as matching

Return ONLY "YES" if they match or "NO" if they don't match. Nothing else.`
        },
        {
          role: 'user',
          content: `Compare these two results:

Result 1: ${result1}
Result 2: ${result2}

Do they contain essentially the same information? Answer YES or NO only.`
        }
      ],
      max_tokens: 10,
      temperature: 0,
    });

    const response = completion.choices[0]?.message?.content?.trim().toUpperCase() || 'NO';
    const match = response === 'YES';
    
    // Simple confidence scoring based on string similarity as backup
    const similarity = calculateStringSimilarity(result1.toLowerCase(), result2.toLowerCase());
    const confidence = match ? Math.max(80, similarity) : Math.min(20, similarity);

    return NextResponse.json({
      match,
      confidence: Math.round(confidence)
    });

  } catch (error) {
    console.error('Comparison API Error:', error);
    
    return NextResponse.json(
      { 
        match: false,
        confidence: 0,
        success: false, 
        error: 'Failed to compare results' 
      },
      { status: 500 }
    );
  }
}

function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 100;
  if (!str1 || !str2) return 0;
  
  // Simple Levenshtein distance-based similarity
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 100;
  
  const distance = levenshteinDistance(longer, shorter);
  return ((longer.length - distance) / longer.length) * 100;
}

function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  return matrix[str2.length][str1.length];
} 