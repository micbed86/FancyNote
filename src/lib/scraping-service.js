import https from 'https';
import { URL } from 'url'; // For domain extraction
import * as cheerio from 'cheerio'; // Import cheerio

// Helper function to extract domain name from URL
function extractDomain(url) {
  try {
    const parsedUrl = new URL(url);
    // Remove 'www.' if present
    let hostname = parsedUrl.hostname;
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }
    return hostname;
  } catch (error) {
    console.error(`Error parsing URL for domain extraction: ${url}`, error);
    return 'invalid_url'; // Fallback domain
  }
}

// Helper function to sanitize filenames (basic example)
function sanitizeFilename(name) {
  // Remove characters not allowed in filenames and replace spaces
  let sanitized = name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, '_');
  // Limit length (optional)
  sanitized = sanitized.substring(0, 100); // Limit to 100 chars
  // Ensure it's not empty
  if (!sanitized) {
    return 'untitled_page';
  }
  return sanitized;
}

/**
 * Scrapes content from a given URL using the Scrapeless API.
 * @param {string} targetUrl The URL to scrape.
 * @returns {Promise<{success: boolean, content?: string, title?: string, error?: string}>}
 *          Object indicating success or failure, with content/title or an error message.
 */
export async function scrapeUrlContent(targetUrl) {
  const apiKey = process.env.SCRAPELESS_API_KEY;
  if (!apiKey) {
    console.error('SCRAPELESS_API_KEY is not set in environment variables.');
    return { success: false, error: 'Scraping service API key not configured.' };
  }

  const host = 'api.scrapeless.com';
  const path = '/api/v1/unlocker/request';
  const apiUrl = `https://${host}${path}`;

  // Construct the payload for the Scrapeless API
  const payload = {
    actor: 'unlocker.webunlocker',
    proxy: {
      country: 'ANY', // Or specify a country if needed
    },
    input: {
      url: targetUrl,
      method: 'GET',
      redirect: true, // Follow redirects
      js_render: true, // Enable JavaScript rendering for dynamic content
      js_instructions: [{ wait: 1500 }], // Wait 1.5 seconds for JS to execute (adjust as needed)
      // block: { // Optional: block resources to speed up scraping
      //   resources: ["image", "font", "media"],
      //   // urls: ["google-analytics.com"]
      // }
    },
  };

  const jsonPayload = JSON.stringify(payload);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-token': apiKey,
      'Content-Length': Buffer.byteLength(jsonPayload),
    },
    timeout: 60000, // Set a timeout (e.g., 60 seconds)
  };

  console.log(`[ScrapingService] Sending request to Scrapeless for URL: ${targetUrl}`);

  return new Promise((resolve) => {
    const req = https.request(apiUrl, options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        console.log(`[ScrapingService] Received response for ${targetUrl}. Status: ${res.statusCode}`);
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const result = JSON.parse(body);
            // Assuming the HTML content is in result.data, result.html, result.content, or result.data.body
            const htmlContent = result?.data || result?.html || result?.content || result?.data?.body;

            if (htmlContent) {
              console.log(`[ScrapingService] Received HTML content for ${targetUrl}. Parsing with Cheerio...`);
              // Log the first 500 characters of the HTML content for inspection
              console.log(`[ScrapingService] HTML Snippet for ${targetUrl}: ${htmlContent.substring(0, 500)}...`);

              const $ = cheerio.load(htmlContent);

              // --- Remove unwanted elements ---
              // Add more selectors for common unwanted elements like comments, related posts, ads, etc.
              $('script, style, header, footer, nav, iframe, noscript, aside, .sidebar, .ad, .advertisement, .related-posts, .comments, #comments, .social-links, .cookie-banner, .cookie-notice, form, button, input').remove();

              // --- Enhanced Cheerio Content Extraction ---
              let $mainContainer = null;
              const selectors = [
                'article',
                'main',
                '.main-content',
                '.article-body',
                '.post-content',
                '.entry-content', // Common WordPress class
                '#content', // Common ID
                '#main',
                'body' // Fallback
              ];

              for (const selector of selectors) {
                const $container = $(selector).first(); // Take the first match for each selector
                if ($container.length > 0) {
                    // Basic check: does it have meaningful text content?
                    const textLength = $container.text().replace(/\s+/g, '').length;
                    console.log(`[ScrapingService] Checking selector '${selector}' for ${targetUrl}. Text length: ${textLength}`);
                    if (textLength > 100) { // Arbitrary threshold for meaningful content
                        $mainContainer = $container;
                        console.log(`[ScrapingService] Selected container '${selector}' for ${targetUrl}.`);
                        break; // Found a suitable container
                    }
                }
              }

              if (!$mainContainer) {
                console.warn(`[ScrapingService] Could not find a suitable main content container for ${targetUrl}. Falling back to body.`);
                $mainContainer = $('body'); // Ensure fallback if loop finishes without finding one
              }

              // --- Refined Text Cleaning ---
              let cleanedLines = [];
              // Select direct children or common block elements within the main container
              $mainContainer.find('p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div:not(:has(p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, div))').each((i, el) => {
                let text = $(el).text();
                text = text.replace(/\s\s+/g, ' ').trim(); // Normalize whitespace within the line

                // Skip empty lines or very short lines likely to be noise
                if (text.length === 0 || (text.length < 15 && !/[.?!]$/.test(text))) {
                    return; // Continue to next element
                }

                // Skip common boilerplate phrases
                if (/^(skip to content|read more|advertisement|share this|related posts)/i.test(text)) {
                    return;
                }

                cleanedLines.push(text);
              });

              // If the above extraction yielded too little, try getting all text nodes directly
              if (cleanedLines.length < 3) {
                console.log(`[ScrapingService] Initial block-level extraction yielded few lines (${cleanedLines.length}). Trying direct text node extraction for ${targetUrl}.`);
                cleanedLines = []; // Reset
                const extractTextNodes = (element) => {
                    $(element).contents().each((_, node) => {
                        if (node.type === 'text') {
                            let text = $(node).text().replace(/\s\s+/g, ' ').trim();
                            if (text.length > 10) { // Keep slightly shorter lines here
                                cleanedLines.push(text);
                            }
                        } else if (node.type === 'tag' && node.name !== 'script' && node.name !== 'style') {
                            extractTextNodes(node); // Recurse into child elements
                        }
                    });
                };
                extractTextNodes($mainContainer.get(0));
              }

              let mainContent = cleanedLines.join('\n\n'); // Join cleaned lines with double newlines for paragraph separation

              // Final cleanup on the joined string
              mainContent = mainContent.replace(/(\n\n)+/g, '\n\n').trim(); // Ensure max one blank line between paragraphs

              // Extract title using Cheerio
              const title = $('title').text().trim() || extractDomain(targetUrl); // Fallback to domain if title tag is empty or missing

              console.log(`[ScrapingService] Final extracted main content for ${targetUrl} (length: ${mainContent.length}): ${mainContent.substring(0, 300)}...`);
              console.log(`[ScrapingService] Final extracted title for ${targetUrl}: ${title || 'N/A'}`);

              if (mainContent) {
                resolve({ success: true, content: mainContent, title: sanitizeFilename(title) });
              } else {
                console.warn(`[ScrapingService] Scraping succeeded for ${targetUrl}, but extracted main content is empty.`);
                resolve({ success: false, error: 'Extracted content is empty.' });
              }
            } else {
              console.warn(`[ScrapingService] Scraping succeeded for ${targetUrl}, but no HTML content found in response body.`);
              console.log(`[ScrapingService] Full API response for ${targetUrl}:`, result); // Log the full result object
              resolve({ success: false, error: 'No HTML content found in response.' });
            }
          } else {
            // Handle API errors (e.g., 4xx, 5xx)
            console.error(`[ScrapingService] Scrapeless API error for ${targetUrl}. Status: ${res.statusCode}, Body: ${body}`);
            let errorMessage = `API Error: Status ${res.statusCode}`;
            try { // Try to parse error message from body
                const errorResult = JSON.parse(body);
                errorMessage = errorResult.message || errorResult.error || errorMessage;
            } catch (parseError) { /* Ignore if body is not JSON */ }
            resolve({ success: false, error: errorMessage });
          }
        } catch (error) {
          console.error(`[ScrapingService] Error processing response for ${targetUrl}:`, error);
          console.error(`[ScrapingService] Raw response body: ${body}`); // Log raw body on parse error
          resolve({ success: false, error: `Failed to process API response: ${error.message}` });
        }
      });
    });

    req.on('error', (error) => {
      console.error(`[ScrapingService] Request error for ${targetUrl}:`, error);
      resolve({ success: false, error: `Request failed: ${error.message}` });
    });

    req.on('timeout', () => {
        console.error(`[ScrapingService] Request timed out for ${targetUrl}`);
        req.destroy(); // Destroy the request object on timeout
        resolve({ success: false, error: 'Request timed out after 60 seconds.' });
    });

    // Write payload and end request
    req.write(jsonPayload);
    req.end();
    });
}

// Basic function to extract title from HTML string using Cheerio (more robust)
function extractTitleFromHtml(htmlString) {
    if (typeof htmlString !== 'string') return '';
    const $ = cheerio.load(htmlString);
    return $('title').text().trim();
}

// Export helpers if they might be needed elsewhere, otherwise keep them internal
export { extractDomain, sanitizeFilename, extractTitleFromHtml }; // Export extractTitleFromHtml as well