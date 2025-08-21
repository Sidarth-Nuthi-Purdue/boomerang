"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateBlogFromTranscription = exports.processVideoForBlog = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const groq_sdk_1 = require("groq-sdk");
const openai_1 = require("openai");
// Use built-in fetch in Node 18+
admin.initializeApp();
// Initialize clients lazily to avoid env var issues during deployment
let groq;
let openai;
const getGroqClient = () => {
    if (!groq) {
        groq = new groq_sdk_1.default({
            apiKey: process.env.GROQ_API_KEY
        });
    }
    return groq;
};
const getOpenAIClient = () => {
    if (!openai) {
        openai = new openai_1.default({
            apiKey: process.env.OPENAI_API_KEY
        });
    }
    return openai;
};
exports.processVideoForBlog = functions.runWith({
    timeoutSeconds: 540,
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
            const transcription = await getGroqClient().audio.transcriptions.create({
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
        }
        catch (transcriptionError) {
            // Clean up even on error
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            throw transcriptionError;
        }
    }
    catch (error) {
        console.error('Video processing error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to process video', error);
    }
});
exports.generateBlogFromTranscription = functions.runWith({
    timeoutSeconds: 300,
    memory: '1GB'
}).https.onCall(async (data, context) => {
    var _a, _b;
    try {
        const { transcriptions, author } = data;
        if (!transcriptions) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing transcriptions');
        }
        // Generate blog content using ChatGPT
        const completion = await getOpenAIClient().chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: `You are a creative blog writer who creates engaging, episodic blog posts from video transcriptions. 
          
          Create a continuing storyline blog post that:
          - Has a catchy, creative title that suggests it's part of an ongoing series
          - Treats this as the NEXT chapter in an ongoing adventure/story
          - References what happened "previously" if there are multiple videos
          - Builds narrative continuity and character development
          - Uses a playful, conversational tone like a personal diary/vlog
          - Includes relevant excerpts as quotes
          - Adds your own witty commentary and insights
          - Creates anticipation for what might happen next
          - Is well-structured with proper paragraphs
          - Feels personal and authentic like an ongoing journey
          
          If multiple video transcriptions are provided, treat the first as "previously" and the second as "this episode".
          
          Format the response as JSON with "title" and "content" fields.`
                },
                {
                    role: 'user',
                    content: `Please create a blog post from these video transcriptions:\n\n${transcriptions}\n\nAuthor: ${author}`
                }
            ],
            temperature: 0.8,
            max_tokens: 2000
        });
        const result = (_b = (_a = completion.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!result) {
            throw new functions.https.HttpsError('internal', 'Failed to generate blog content');
        }
        // Parse the JSON response
        let blogData;
        try {
            blogData = JSON.parse(result);
        }
        catch (parseError) {
            // Fallback if JSON parsing fails
            blogData = {
                title: 'Video Blog Post',
                content: result
            };
        }
        return {
            success: true,
            title: blogData.title || 'Generated Blog Post',
            content: blogData.content || result
        };
    }
    catch (error) {
        console.error('Blog generation error:', error);
        throw new functions.https.HttpsError('internal', 'Failed to generate blog', error);
    }
});
//# sourceMappingURL=index.js.map