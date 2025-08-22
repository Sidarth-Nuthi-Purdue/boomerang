import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Groq from 'groq-sdk';
import OpenAI from 'openai';
// Use built-in fetch in Node 18+

admin.initializeApp();

// Initialize clients lazily using Firestore API keys
let groq: Groq;
let openai: OpenAI;

const getApiKeys = async () => {
  const db = admin.firestore();
  const configDoc = await db.collection('config').doc('api-keys').get();
  
  if (!configDoc.exists) {
    throw new Error('API keys not found in Firestore. Please add them to config/api-keys document.');
  }
  
  const data = configDoc.data();
  return {
    groqApiKey: data?.groqApiKey,
    openaiApiKey: data?.openaiApiKey
  };
};

const getGroqClient = async () => {
  if (!groq) {
    const { groqApiKey } = await getApiKeys();
    if (!groqApiKey) {
      throw new Error('Groq API key not found in Firestore config');
    }
    groq = new Groq({
      apiKey: groqApiKey
    });
  }
  return groq;
};

const getOpenAIClient = async () => {
  if (!openai) {
    const { openaiApiKey } = await getApiKeys();
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not found in Firestore config');
    }
    openai = new OpenAI({
      apiKey: openaiApiKey
    });
  }
  return openai;
};

export const processVideoForBlog = functions.runWith({
  timeoutSeconds: 540, // 9 minutes
  memory: '2GB'
}).https.onCall(async (data, context) => {
  try {
    const { videoUrl, videoId } = data;

    if (!videoUrl || !videoId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters');
    }

    // Download file
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new functions.https.HttpsError('internal', 'Failed to download video');
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Determine file type from URL
    const isAudio = videoUrl.includes('/audio/') || videoUrl.includes('.webm');
    const fileName = `media_${videoId}${isAudio ? '.webm' : '.mp4'}`;
    
    console.log(`Processing ${isAudio ? 'audio' : 'video'} file: ${fileName}, size: ${buffer.length} bytes`);
    
    // Write to temporary file
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, buffer);
    
    try {
      // Use fs.createReadStream which Groq SDK expects
      const groqClient = await getGroqClient();
      const transcription = await groqClient.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-large-v3-turbo',
        response_format: 'verbose_json',
        language: 'en',
        temperature: 0.0
      });
      
      // Clean up
      fs.unlinkSync(tempFilePath);
      
      return {
        success: true,
        transcription: transcription.text,
        videoId
      };
      
    } catch (transcriptionError) {
      // Clean up even on error
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw transcriptionError;
    }

  } catch (error) {
    console.error('Video processing error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process video', error);
  }
});

export const generateBlogFromTranscription = functions.runWith({
  timeoutSeconds: 300, // 5 minutes
  memory: '1GB'
}).https.onCall(async (data, context) => {
  try {
    const { transcriptions, author } = data;

    if (!transcriptions) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing transcriptions');
    }

    // Generate blog content using ChatGPT
    const openaiClient = await getOpenAIClient();
    const completion = await openaiClient.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are writing a diary post for a video. The audience is the two people who are in the video. Tailor it to them. Talk to them directly. Make fun of them sometimes.
          The multiple transcriptions are from the same post, so they are all part of the same story.
            Create a continuing storyline diary post that:
            - Has a catchy, creative title that suggests it's part of an ongoing series
            - Uses a playful, conversational tone like a personal diary/vlog
            - Includes relevant excerpts as quotes
            - Adds your own witty commentary and insights. Make fun of the people in the video.
            - Creates anticipation for what might happen next
            - Is well-structured with proper paragraphs
            - Feels personal and authentic like an ongoing journey
            - Reference the people in the video by name (Sid is the guy and Alex is the girl). Don't use "the two people" or "the two of them" or "the two of us" or "the two of them".
            - Add paragraphs to the content to make it more readable.

            Return ONLY a JSON object with exactly this format:
            {
              "title": "Your creative title here",
              "content": "Your blog post content here with proper paragraph breaks using \\n\\n between paragraphs"
            }

            Make sure the content uses \\n\\n to separate paragraphs for proper formatting.`
      },
        {
          role: 'user',
          content: `Please create a blog post from these video transcriptions:\n\n${transcriptions}\n\nAuthor: ${author}`
        }
      ],
      temperature: 0.8,
      max_tokens: 2000
    });

    const result = completion.choices[0]?.message?.content;
    if (!result) {
      throw new functions.https.HttpsError('internal', 'Failed to generate blog content');
    }

    // Parse the JSON response
    let blogData;
    try {
      // Clean up the result in case there are extra characters
      const cleanResult = result.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      blogData = JSON.parse(cleanResult);
      
      // Ensure we have the expected structure
      if (!blogData.title || !blogData.content) {
        throw new Error('Invalid JSON structure');
      }
    } catch (parseError) {
      console.log('JSON parsing failed, attempting to extract content:', parseError);
      
      // Try to extract JSON from the response if it's wrapped in other text
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          blogData = JSON.parse(jsonMatch[0]);
        } catch (secondParseError) {
          // Final fallback if JSON parsing completely fails
          blogData = {
            title: 'Generated Blog Post',
            content: result
          };
        }
      } else {
        // Final fallback if JSON parsing completely fails
        blogData = {
          title: 'Generated Blog Post', 
          content: result
        };
      }
    }

    return {
      success: true,
      title: blogData.title || 'Generated Blog Post',
      content: blogData.content || result
    };

  } catch (error) {
    console.error('Blog generation error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate blog', error);
  }
});