const generatedHeaderSets = require('./headers.js');

addEventListener('fetch', event => {
	event.respondWith(handleRequest(event.request))
  })
  
  async function handleRequest(request) {
	const url = new URL(request.url)
	const path = url.pathname.replace(/\/$/, '') // Remove trailing slash if present
  
	if (path === '/api/transcript') {
	  return await handleTranscriptRequest(url.searchParams)
	} else if (path === '/openapi.json') {
	  return handleOpenAPIRequest(request)
	} else {
	  return new Response('Not Found', { status: 404 })
	}
  }
  
  async function handleTranscriptRequest(params) {
	const youtubeUrl = params.get('url')
	const outputType = params.get('output') || 'json'
  
	if (!youtubeUrl) {
	  return new Response(JSON.stringify({ error: 'Missing YouTube URL' }), {
		status: 400,
		headers: { 'Content-Type': 'application/json' }
	  })
	}
  
	try {
	  const videoId = extractVideoId(youtubeUrl)
	  const captionTrack = await fetchCaptionTrack(videoId)
	  const parsedCaptions = parseCaptions(captionTrack)
	  
	  return formatResponse(parsedCaptions, outputType)
	} catch (error) {
	  return new Response(JSON.stringify({ error: error.message }), {
		status: 500,
		headers: { 'Content-Type': 'application/json' }
	  })
	}
  }
  
  function handleOpenAPIRequest(request) {
	const schema = {
	  "openapi": "3.1.0",
	  "info": {
		"title": "YouTube Transcript API",
		"description": "Retrieves transcript data for YouTube videos in JSON, SRT, or plain text format.",
		"version": "v1.1.0"
	  },
	  "servers": [
		{
		  "url": `https://${request.headers.get('host')}`
		}
	  ],
	  "paths": {
		"/api/transcript": {
		  "get": {
			"description": "Get transcript for a specific YouTube video",
			"operationId": "GetYouTubeTranscript",
			"parameters": [
			  {
				"name": "url",
				"in": "query",
				"description": "The full URL of the YouTube video",
				"required": true,
				"schema": {
				  "type": "string"
				}
			  },
			  {
				"name": "output",
				"in": "query",
				"description": "The desired output format (json, srt, or text)",
				"required": false,
				"schema": {
				  "type": "string",
				  "enum": ["json", "srt", "text"],
				  "default": "json"
				}
			  }
			],
			"responses": {
			  "200": {
				"description": "Successful response",
				"content": {
				  "application/json": {
					"schema": {
					  "type": "array",
					  "items": {
						"type": "object",
						"properties": {
						  "text": {"type": "string"},
						  "start": {"type": "number"},
						  "duration": {"type": "number"}
						}
					  }
					}
				  },
				  "text/plain": {
					"schema": {
					  "type": "string",
					  "description": "SRT or plain text formatted transcript"
					}
				  }
				}
			  },
			  "400": {
				"description": "Bad request - Invalid YouTube URL or output format"
			  },
			  "404": {
				"description": "Transcript not available for this video"
			  },
			  "429": {
				"description": "Rate limit exceeded"
			  },
			  "500": {
				"description": "Internal server error"
			  }
			}
		  }
		}
	  },
	  "components": {
		"schemas": {}
	  }
	}
  
	return new Response(JSON.stringify(schema, null, 2), {
	  headers: { 'Content-Type': 'application/json' }
	})
  }
  
  function extractVideoId(url) {
	const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
	const match = url.match(regex)
	if (!match) throw new Error('Invalid YouTube URL')
	return match[1]
  }
  
  async function fetchCaptionTrack(videoId) {
    // Randomly select one of the pre-generated header sets
    const randomHeaders = generatedHeaderSets[Math.floor(Math.random() * generatedHeaderSets.length)];
    
    const fetchHeaders = {
      ...randomHeaders,
      'Referer': `https://www.youtube.com/watch?v=${videoId}`,
    };
    
    let response;
    try {
      response = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: fetchHeaders
      });
      
      if (!response.ok) {
        switch (response.status) {
          case 404:
            throw new Error('Video not found');
          case 429:
            throw new Error('Rate limit exceeded');
          default:
            throw new Error(`HTTP error! status: ${response.status}`);
        }
      }
      
      const html = await response.text();
      
      if (html.includes('class="g-recaptcha"')) {
        throw new Error('YouTube is receiving too many requests from this IP and now requires solving a captcha to continue');
      }

      if (!html.includes('"playabilityStatus":')) {
        throw new Error(`The video is no longer available (${videoId})`);
      }
      
      const captionRegex = /"captionTracks":\s*(\[.*?\])/;
      const match = html.match(captionRegex);
      if (!match) throw new Error('Invalid video or no captions found for it');
      
      const captionTracks = JSON.parse(match[1]);
      let selectedTrack = captionTracks.find(track => track.languageCode === 'en');
      if (!selectedTrack) {
        selectedTrack = captionTracks[0];
        if (!selectedTrack) throw new Error('No caption languages found');
      }
      
      const captionResponse = await fetch(selectedTrack.baseUrl, {
        headers: fetchHeaders
      });
      
      if (!captionResponse.ok) {
        throw new Error(`Failed to fetch captions: ${captionResponse.status}`);
      }
      
      return await captionResponse.text();
    } catch (error) {
      console.error('Error fetching caption track:', error);
      throw error;
    }
  }
  
  function parseCaptions(captionTrack) {
	const regex = /<text start="([\d.]+)" dur="([\d.]+)".*?>([\s\S]*?)<\/text>/g
	const captions = []
	let match

	while ((match = regex.exec(captionTrack)) !== null) {
	  captions.push({
		start: parseFloat(match[1]),
		duration: parseFloat(match[2]),
		text: decodeHTMLEntities(match[3].trim())
	  })
	}
  
	return captions
  }
  
  function decodeHTMLEntities(text) {
	return text.replace(/&amp;/g, '&')
			   .replace(/&lt;/g, '<')
			   .replace(/&gt;/g, '>')
			   .replace(/&quot;/g, '"')
			   .replace(/&#39;/g, "'")
			   .replace(/\n/g, ' ')
			   .replace(/\s+/g, ' ')
  }
  
  function formatResponse(captions, outputType) {
	switch (outputType.toLowerCase()) {
	  case 'json':
		return new Response(JSON.stringify(captions), {
		  headers: { 'Content-Type': 'application/json' }
		})
	  case 'srt':
		return new Response(formatSRT(captions), {
		  headers: { 'Content-Type': 'text/plain' }
		})
	  case 'text':
		return new Response(captions.map(c => c.text).join('\n'), {
		  headers: { 'Content-Type': 'text/plain' }
		})
	  default:
		return new Response(JSON.stringify({ error: 'Invalid output type' }), {
		  status: 400,
		  headers: { 'Content-Type': 'application/json' }
		})
	}
  }
  
  function formatSRT(captions) {
	return captions.map((caption, index) => {
	  const start = formatTime(caption.start)
	  const end = formatTime(caption.start + caption.duration)
	  return `${index + 1}\n${start} --> ${end}\n${caption.text}\n`
	}).join('\n')
  }
  
  function formatTime(seconds) {
	const date = new Date(seconds * 1000)
	const hh = date.getUTCHours().toString().padStart(2, '0')
	const mm = date.getUTCMinutes().toString().padStart(2, '0')
	const ss = date.getUTCSeconds().toString().padStart(2, '0')
	const ms = date.getUTCMilliseconds().toString().padStart(3, '0')
	return `${hh}:${mm}:${ss},${ms}`
  }