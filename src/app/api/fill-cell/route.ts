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
  model?: string;
}

interface FillCellResponse {
  value: string;
  source: string;
  success: boolean;
  error?: string;
}

// Function to clean up markdown links and extract URLs
function cleanResponseAndExtractUrls(text: string): { cleanText: string; extractedUrls: string[] } {
  const extractedUrls: string[] = [];
  
  // Match markdown links: [text](url) or [text](url "title")
  const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)(?:\s+"[^"]*")?\)/g;
  
  // Extract URLs and clean the text
  let cleanText = text.replace(markdownLinkRegex, (match, linkText, url) => {
    extractedUrls.push(url.trim()); // Keep original URL for source attribution
    // Return empty string to completely remove the link
    return '';
  });
  
  // Remove bare URLs that might be in parentheses like (domain.com)
  const bareUrlRegex = /\(https?:\/\/[^\s)]+\)/g;
  cleanText = cleanText.replace(bareUrlRegex, (match) => {
    const url = match.slice(1, -1); // Remove parentheses
    extractedUrls.push(url);
    return ''; // Remove the parenthetical URL
  });
  
  // Remove domain names in parentheses like (tweettown.com)
  const domainRegex = /\([a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\)/g;
  cleanText = cleanText.replace(domainRegex, (match) => {
    // Don't add to extractedUrls since it's just a domain, not a full URL
    return ''; // Remove the parenthetical domain
  });
  
  // Remove any remaining standalone URLs
  const standaloneUrlRegex = /https?:\/\/[^\s]+/g;
  cleanText = cleanText.replace(standaloneUrlRegex, (match) => {
    extractedUrls.push(match);
    return ''; // Remove the URL
  });
  
  // Clean up extra whitespace and punctuation
  cleanText = cleanText
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/\s*\.\s*\./g, '.') // Remove double periods
    .replace(/\s*,\s*,/g, ',') // Remove double commas
    .replace(/\s+([.,!?])/g, '$1') // Remove space before punctuation
    .replace(/\(\s*\)/g, '') // Remove empty parentheses
    .replace(/\s*\(\s*$/, '') // Remove opening parenthesis at end
    .replace(/^\s*\)\s*/, '') // Remove closing parenthesis at start
    .replace(/\s*\(\s*\)\s*/g, ' ') // Remove empty parentheses with spaces
    .trim();
  
  return {
    cleanText: cleanText || 'Not Found',
    extractedUrls: [...new Set(extractedUrls)] // Remove duplicates
  };
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
    const { prompt, context, columnKey, model } = body;

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

    const userPrompt = `You are a business research assistant helping to fill spreadsheet cells with accurate, up-to-date information about companies.

INSTRUCTIONS:
1. ALWAYS use web search to find the most current information about the company - this is REQUIRED
2. Return ONLY the specific information requested - no explanations or additional text. This is going in a spreadsheet cell, so ONLY THE FINAL ANSWER SHOULD BE RETURNED, NOTHING ELSE.
3. If you cannot find the information after searching, return "Not Found"
4. For websites: Return the full URL (including https://)
5. For emails: Return a valid business email address
6. For phone numbers: Return in standard format (e.g., 1-800-555-0123)
7. Prioritize official company sources and reliable business directories
8. You MUST search the web before providing any answer - do not rely on training data

CONTEXT ABOUT THIS COMPANY:
${contextInfo || 'No additional context provided'}

TASK: ${prompt}

You must search the web for current information and return only the requested information, nothing else.`;

    // Determine which model to use
    const selectedModel = model || 'gpt-4o';
    const useWebSearch = !model || (model !== 'gpt-4.1' && (model === 'gpt-4o' || model === 'gpt-4o-mini'));

    try {
      // Try using the new Responses API with web search first (for supported models)
      if (useWebSearch) {
        const response = await openai.responses.create({
          model: selectedModel,
          input: userPrompt,
          tools: [
            {
              type: 'web_search_preview'
            }
          ],
          tool_choice: {
            type: 'web_search_preview'
          },
          temperature: 0.1,
        });

        // Extract the response content
        let aiResponse = 'Not Found';
        let sourceUrls: string[] = [];

        if (response.output && response.output.length > 0) {
          // Find the last message in the output
          const lastMessage = response.output
            .filter((item: any) => item.type === 'message')
            .pop();

          if (lastMessage && lastMessage.type === 'message' && 'content' in lastMessage && lastMessage.content && lastMessage.content.length > 0) {
            const textContent = lastMessage.content.find((content: any) => content.type === 'output_text');
            if (textContent && 'text' in textContent) {
              const rawResponse = textContent.text.trim() || 'Not Found';
              
              // Clean up the response and extract URLs
              const { cleanText, extractedUrls } = cleanResponseAndExtractUrls(rawResponse);
              aiResponse = cleanText || 'Not Found';
              
              // Combine extracted URLs with annotation URLs
              if ('annotations' in textContent && textContent.annotations) {
                const annotationUrls = textContent.annotations
                  .filter((annotation: any) => annotation.type === 'url_citation')
                  .map((annotation: any) => annotation.url);
                sourceUrls = [...new Set([...extractedUrls, ...annotationUrls])].slice(0, 3);
              } else {
                sourceUrls = extractedUrls.slice(0, 3);
              }
            }
          }
        }

        // Generate source description
        const sourceDescription = sourceUrls.length > 0 
          ? sourceUrls.join(', ')
          : contextInfo 
            ? `Company context: ${Object.keys(context).join(', ')}`
            : 'Web search results';

        return NextResponse.json({
          value: aiResponse,
          source: sourceDescription,
          success: true
        });
      } else {
        // For o3 and other models without web search, use Chat Completions
        const completion = await openai.chat.completions.create({
          model: selectedModel,
          messages: [
            {
              role: 'system',
              content: `You are a business research assistant helping to fill spreadsheet cells with accurate information about companies.

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

Return only the requested information, nothing else.`
            },
            {
              role: 'user',
              content: `Please find the information requested for this company.`
            }
          ],
          max_tokens: 500,
          temperature: 0.1,
        });

        const aiResponse = completion.choices[0]?.message?.content?.trim() || 'Not Found';

        // Generate source description for non-web-search models
        const sourceDescription = contextInfo 
          ? `AI research based on company context: ${Object.keys(context).join(', ')}`
          : `AI research using ${selectedModel}`;

        return NextResponse.json({
          value: aiResponse,
          source: sourceDescription,
          success: true
        });
      }

    } catch (responsesError) {
      console.log('Responses API not available, falling back to Chat Completions:', responsesError);
      
      // Handle specific OpenAI errors
      if (responsesError instanceof Error) {
        if (responsesError.message.includes('API key')) {
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
        
        if (responsesError.message.includes('quota')) {
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