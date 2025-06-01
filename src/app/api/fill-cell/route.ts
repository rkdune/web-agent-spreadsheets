import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

interface OpenAIAnnotation {
  type: string;
  url?: string;
  start_index?: number;
  end_index?: number;
  title?: string;
}

interface OpenAIContent {
  type: string;
  text?: string;
  url?: string;
  annotations?: OpenAIAnnotation[];
}

interface OpenAIMessage {
  type: string;
  content?: OpenAIContent[];
}

interface OpenAIOutputItem {
  type: string;
  content?: OpenAIContent[];
}

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
  
  // First, handle the required source format: "(Source: URL)"
  const sourceFormatRegex = /\(Source:\s*([^)]+)\)/gi;
  let cleanText = text.replace(sourceFormatRegex, (match, url) => {
    extractedUrls.push(url.trim());
    return ''; // Remove the source citation from display text
  });
  
  // Match markdown links: [text](url) or [text](url "title")
  const markdownLinkRegex = /\[([^\]]*)\]\(([^)]+)(?:\s+"[^"]*")?\)/g;
  
  // Extract URLs and clean the text
  cleanText = cleanText.replace(markdownLinkRegex, (match, linkText, url) => {
    extractedUrls.push(url.trim()); // Keep original URL for source attribution
    // Return empty string to completely remove the link
    return '';
  });
  
  // Remove bare URLs that might be in parentheses like (domain.com) or (https://domain.com)
  const bareUrlRegex = /\((https?:\/\/[^\s)]+)\)/g;
  cleanText = cleanText.replace(bareUrlRegex, (match, url) => {
    extractedUrls.push(url);
    return ''; // Remove the parenthetical URL
  });
  
  // Remove domain names in parentheses like (tweettown.com) but convert to full URLs
  const domainRegex = /\(([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/g;
  cleanText = cleanText.replace(domainRegex, (match, domain) => {
    // Convert domain to full URL if it doesn't start with http
    const fullUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    extractedUrls.push(fullUrl);
    return ''; // Remove the parenthetical domain
  });
  
  // Remove any remaining standalone URLs (more aggressive pattern)
  const standaloneUrlRegex = /https?:\/\/[^\s\[\]()]+/g;
  cleanText = cleanText.replace(standaloneUrlRegex, (match) => {
    extractedUrls.push(match);
    return ''; // Remove the URL
  });
  
  // Look for URLs mentioned in the text like "from example.com" or "source: example.com"
  const mentionedUrlRegex = /(?:from|source:|found on|via)\s+([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  cleanText = cleanText.replace(mentionedUrlRegex, (match, domain) => {
    const fullUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    extractedUrls.push(fullUrl);
    return match.split(' ')[0]; // Keep just "from" or "source:" etc.
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

CRITICAL INSTRUCTIONS:
1. You MUST search the web extensively for this information - do not give up easily
2. Try multiple search terms and approaches if the first search doesn't yield results
3. Look for company websites, business directories, SEC filings, news articles, and investor relations pages
4. For board member information, check company annual reports, proxy statements, and investor pages
5. Return ONLY the specific information requested - be concise and direct
6. For numbers: Return just the number (e.g., "5" not "5 members" or explanations)
7. For websites: Return the full URL (including https://)
8. For emails: Return a valid business email address only
9. For phone numbers: Return in standard format only
10. If you truly cannot find the information after extensive searching, return "Not Found"
11. NO explanations, NO additional context, NO verbose descriptions - just the requested data

CONTEXT ABOUT THIS COMPANY:
${contextInfo || 'No additional context provided'}

SEARCH TASK: ${prompt}

Search the web thoroughly and return ONLY the specific information requested. Be concise - this is for a spreadsheet cell.`;

    // Determine which model to use - 4o mini should be default for reliability
    const selectedModel = model || 'gpt-4o-mini';
    
    try {
      // ALWAYS try web search first, regardless of model
      // If the model doesn't support Responses API, it will throw an error and we'll catch it
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
          .filter((item: OpenAIOutputItem) => item.type === 'message')
          .pop() as OpenAIMessage | undefined;

        if (lastMessage && lastMessage.type === 'message' && lastMessage.content && lastMessage.content.length > 0) {
          const textContent = lastMessage.content.find((content: OpenAIContent) => content.type === 'output_text');
          if (textContent && textContent.text) {
            const rawResponse = textContent.text.trim() || 'Not Found';
            
            // Clean up the response and extract URLs
            const { cleanText, extractedUrls } = cleanResponseAndExtractUrls(rawResponse);
            aiResponse = cleanText || 'Not Found';
            
            // Combine extracted URLs with annotation URLs
            if (textContent.annotations && textContent.annotations.length > 0) {
              const annotationUrls = textContent.annotations
                .filter((annotation: OpenAIAnnotation) => annotation.type === 'url_citation')
                .map((annotation: OpenAIAnnotation) => annotation.url)
                .filter((url): url is string => !!url);
              sourceUrls = [...new Set([...extractedUrls, ...annotationUrls])].slice(0, 3);
            } else {
              sourceUrls = extractedUrls.slice(0, 3);
            }
            
            // Debug logging to see what we're getting
            console.log('Raw response:', rawResponse);
            console.log('Extracted URLs:', extractedUrls);
            console.log('Text content annotations:', textContent.annotations || 'none');
            console.log('Final source URLs:', sourceUrls);
          }
        }
        
        // Check all content items for sources, not just output_text
        if (lastMessage && lastMessage.type === 'message' && lastMessage.content) {
          lastMessage.content.forEach((content: OpenAIContent, index: number) => {
            console.log(`Content item ${index}:`, content.type, content);
            
            // Look for web search results or citations in any content type
            if (content.type === 'web_search_result' || content.type === 'citation') {
              if (content.url) {
                sourceUrls.push(content.url);
              }
            }
            
            // Check for annotations on any content type
            if (content.annotations && content.annotations.length > 0) {
              const urls = content.annotations
                .filter((annotation: OpenAIAnnotation) => annotation.type === 'url_citation' && annotation.url)
                .map((annotation: OpenAIAnnotation) => annotation.url)
                .filter((url): url is string => !!url);
              sourceUrls.push(...urls);
            }
          });
          
          // Remove duplicates and limit
          sourceUrls = [...new Set(sourceUrls)].slice(0, 3);
        }
      }

      // If we got a response but no sources, try Chat Completions API as fallback
      if (aiResponse !== 'Not Found' && sourceUrls.length === 0) {
        console.log('Got response without sources, trying Chat Completions fallback to force source citation');
        
        try {
          const chatResponse = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              {
                role: 'system',
                content: 'You are a business research assistant. You MUST always include the source URL where you found information. Format: "[ANSWER] (Source: [URL])". Never give answers without sources.'
              },
              {
                role: 'user',
                content: userPrompt
              }
            ],
            temperature: 0.1,
          });

          if (chatResponse.choices[0]?.message?.content) {
            const chatRawResponse = chatResponse.choices[0].message.content.trim();
            const { cleanText: chatCleanText, extractedUrls: chatExtractedUrls } = cleanResponseAndExtractUrls(chatRawResponse);
            
            // If chat completions gave us sources, use that instead
            if (chatExtractedUrls.length > 0) {
              aiResponse = chatCleanText;
              sourceUrls = chatExtractedUrls.slice(0, 3);
              console.log('Chat Completions fallback provided sources:', sourceUrls);
            }
          }
        } catch (chatError) {
          console.log('Chat Completions fallback failed:', chatError);
          // Continue with original response
        }
      }

      // Generate source description - only show if we have sources
      const sourceDescription = sourceUrls.length > 0 
        ? sourceUrls.join(', ')
        : '';

      // Console log for debugging
      console.log('Final response - Value:', aiResponse, 'Sources:', sourceUrls, 'Description:', sourceDescription);

      return NextResponse.json({
        value: aiResponse,
        source: sourceDescription,
        success: true
      });

    } catch (responsesError) {
      console.log(`Responses API failed for model ${selectedModel}, trying fallback with gpt-4o-mini:`, responsesError);
      
      // If the requested model doesn't support Responses API, try with gpt-4o-mini which definitely does
      try {
        const fallbackResponse = await openai.responses.create({
          model: 'gpt-4o-mini', // Force use of reliable web search model
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

        // Extract the response content (same logic as above)
        let aiResponse = 'Not Found';
        let sourceUrls: string[] = [];

        if (fallbackResponse.output && fallbackResponse.output.length > 0) {
          const lastMessage = fallbackResponse.output
            .filter((item: OpenAIOutputItem) => item.type === 'message')
            .pop() as OpenAIMessage | undefined;

          if (lastMessage && lastMessage.type === 'message' && lastMessage.content && lastMessage.content.length > 0) {
            const textContent = lastMessage.content.find((content: OpenAIContent) => content.type === 'output_text');
            if (textContent && textContent.text) {
              const rawResponse = textContent.text.trim() || 'Not Found';
              
              const { cleanText, extractedUrls } = cleanResponseAndExtractUrls(rawResponse);
              aiResponse = cleanText || 'Not Found';
              
              if (textContent.annotations && textContent.annotations.length > 0) {
                const annotationUrls = textContent.annotations
                  .filter((annotation: OpenAIAnnotation) => annotation.type === 'url_citation')
                  .map((annotation: OpenAIAnnotation) => annotation.url)
                  .filter((url): url is string => !!url);
                sourceUrls = [...new Set([...extractedUrls, ...annotationUrls])].slice(0, 3);
              } else {
                sourceUrls = extractedUrls.slice(0, 3);
              }
            }
          }
          
          // Check all content items for sources in fallback too
          if (lastMessage && lastMessage.type === 'message' && lastMessage.content) {
            lastMessage.content.forEach((content: OpenAIContent) => {
              // Look for web search results or citations in any content type
              if (content.type === 'web_search_result' || content.type === 'citation') {
                if (content.url) {
                  sourceUrls.push(content.url);
                }
              }
              
              // Check for annotations on any content type
              if (content.annotations && content.annotations.length > 0) {
                const urls = content.annotations
                  .filter((annotation: OpenAIAnnotation) => annotation.type === 'url_citation' && annotation.url)
                  .map((annotation: OpenAIAnnotation) => annotation.url)
                  .filter((url): url is string => !!url);
                sourceUrls.push(...urls);
              }
            });
            
            // Remove duplicates and limit
            sourceUrls = [...new Set(sourceUrls)].slice(0, 3);
          }
        }

        // If we got a response but no sources in fallback, try Chat Completions API as final fallback
        if (aiResponse !== 'Not Found' && sourceUrls.length === 0) {
          console.log('Fallback got response without sources, trying Chat Completions final fallback');
          
          try {
            const chatResponse = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a business research assistant. You MUST always include the source URL where you found information. Format: "[ANSWER] (Source: [URL])". Never give answers without sources.'
                },
                {
                  role: 'user',
                  content: userPrompt
                }
              ],
              temperature: 0.1,
            });

            if (chatResponse.choices[0]?.message?.content) {
              const chatRawResponse = chatResponse.choices[0].message.content.trim();
              const { cleanText: chatCleanText, extractedUrls: chatExtractedUrls } = cleanResponseAndExtractUrls(chatRawResponse);
              
              // If chat completions gave us sources, use that instead
              if (chatExtractedUrls.length > 0) {
                aiResponse = chatCleanText;
                sourceUrls = chatExtractedUrls.slice(0, 3);
                console.log('Chat Completions final fallback provided sources:', sourceUrls);
              }
            }
          } catch (chatError) {
            console.log('Chat Completions final fallback failed:', chatError);
            // Continue with original response
          }
        }

        const sourceDescription = sourceUrls.length > 0 
          ? sourceUrls.join(', ')
          : '';

        return NextResponse.json({
          value: aiResponse,
          source: sourceDescription,
          success: true
        });

      } catch (fallbackError) {
        console.log('Fallback web search also failed, using final chat completions fallback:', fallbackError);
        
        // Handle specific OpenAI errors
        if (fallbackError instanceof Error) {
          if (fallbackError.message.includes('API key')) {
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
          
          if (fallbackError.message.includes('quota')) {
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
            error: 'Failed to generate content with web search' 
          },
          { status: 500 }
        );
      }
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