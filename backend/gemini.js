import axios from "axios";

const geminiResponse = async (command, assistantName, userName) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const apiUrl = process.env.GEMINI_API_URL;
        
        // Validate environment variables
        if (!apiKey || !apiUrl) {
            console.error('❌ Missing environment variables');
            throw new Error('GEMINI_API_KEY or GEMINI_API_URL environment variables are not set');
        }

        // Get current date and time for time-related queries
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: true 
        });
        const currentDate = now.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
        const currentMonth = now.toLocaleDateString('en-US', { month: 'long' });

        const prompt = `You are a virtual assistant named ${assistantName} created by ${userName}.
You are not Google Assistant, Siri, or any other assistant. You are ${assistantName}.

Current information:
- Time: ${currentTime}
- Date: ${currentDate}
- Day: ${currentDay}
- Month: ${currentMonth}

Your task is to understand the user's natural language input and respond with a JSON object exactly like this:

{
  "type": "general",
  "userInput": "original user input",
  "response": "short spoken response in Hindi or English"
}

Available types:
- "general": factual/informational questions, greetings, or general conversation
- "google-search": user wants to search something on Google
- "youtube-search": user wants to search something on YouTube  
- "youtube-play": user wants to play a specific video/song on YouTube
- "calculator-open": user wants to open calculator
- "instagram-open": user wants to open Instagram
- "facebook-open": user wants to open Facebook
- "weather-show": user wants to see weather information
- "get-time": user asks for current time (respond with actual time: ${currentTime})
- "get-date": user asks for today's date (respond with actual date: ${currentDate})
- "get-day": user asks what day it is (respond with: ${currentDay})
- "get-month": user asks for current month (respond with: ${currentMonth})

Rules:
1. For search queries, userInput should contain only the search terms (remove assistant name like "${assistantName}")
2. For time/date queries, include the actual current information in your response
3. Response should be brief and natural for speech (mix Hindi/English as appropriate)
4. Return ONLY the JSON object, no markdown formatting or extra text
5. If asked who created you, mention ${userName}
6. For greetings, be friendly and ask how you can help
7. For general knowledge questions, provide brief, accurate answers

Examples:
- "${assistantName} what time is it?" → type: "get-time", response: "Current time is ${currentTime}"
- "${assistantName} search cats on YouTube" → type: "youtube-search", userInput: "cats", response: "Searching for cats on YouTube"
- "${assistantName} what is AI?" → type: "general", response: "AI is artificial intelligence that mimics human thinking"

User input: "${command}"

Respond with valid JSON only:`;

        console.log('🚀 Making request to Gemini 2.5 Flash...');
        
        const requestData = {
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.7,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 1024,
                responseMimeType: "application/json" // Request JSON response
            },
            safetySettings: [
                {
                    category: "HARM_CATEGORY_HARASSMENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_HATE_SPEECH", 
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                },
                {
                    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold: "BLOCK_MEDIUM_AND_ABOVE"
                }
            ]
        };

        // Use x-goog-api-key header as shown in your curl command
        const result = await axios.post(apiUrl, requestData, {
            timeout: 15000,
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey // Using header instead of query parameter
            }
        });

        console.log('✅ Gemini API Response received');
        
        // Validate response structure
        if (!result.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            console.error('❌ Invalid response structure:', result.data);
            throw new Error('Invalid response structure from Gemini API');
        }

        let responseText = result.data.candidates[0].content.parts[0].text;
        console.log('📝 Raw response:', responseText);

        // Clean and parse JSON
        try {
            // Remove any markdown formatting
            responseText = responseText
                .replace(/```json\n?/g, '')
                .replace(/\n?```/g, '')
                .replace(/^\s*[\r\n]/gm, '')
                .trim();

            const parsedResponse = JSON.parse(responseText);
            
            // Validate required fields
            if (!parsedResponse.type || !parsedResponse.userInput || !parsedResponse.response) {
                console.error('❌ Missing required fields:', parsedResponse);
                throw new Error('Missing required fields in response');
            }

            // Ensure userInput is a string and response is not empty
            if (typeof parsedResponse.userInput !== 'string' || !parsedResponse.response.trim()) {
                throw new Error('Invalid field types in response');
            }

            console.log('✅ Parsed response:', parsedResponse);
            return parsedResponse;

        } catch (parseError) {
            console.error('❌ JSON parse error:', parseError);
            console.error('Raw response text:', responseText);
            
            // Try to create a smart fallback based on the command
            const fallbackResponse = createFallbackResponse(command, assistantName, currentTime, currentDate, currentDay, currentMonth);
            console.log('🔄 Using fallback response:', fallbackResponse);
            return fallbackResponse;
        }

    } catch (error) {
        console.error('❌ Gemini API Error:', error);
        
        // Handle different error types
        if (error.code === 'ECONNABORTED') {
            console.error('⏰ Request timeout - Gemini API took too long');
        } else if (error.response) {
            console.error('📡 HTTP Error:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            });
            
            // Handle specific API errors
            switch(error.response.status) {
                case 400:
                    console.error('❌ Bad request - Invalid request format');
                    break;
                case 403:
                    console.error('❌ Forbidden - Invalid API key or quota exceeded');
                    break;
                case 404:
                    console.error('❌ Not found - Check model name (gemini-2.5-flash)');
                    break;
                case 429:
                    console.error('❌ Rate limit exceeded - Too many requests');
                    break;
                case 500:
                    console.error('❌ Internal server error - Gemini API issue');
                    break;
            }
        } else if (error.request) {
            console.error('🌐 Network error - No response received');
        } else {
            console.error('⚠️ Unknown error:', error.message);
        }

        // Return fallback response
        const fallbackResponse = createFallbackResponse(command, assistantName);
        console.log('🔄 Using error fallback response:', fallbackResponse);
        return fallbackResponse;
    }
};

// Helper function to create intelligent fallback responses
const createFallbackResponse = (command, assistantName, currentTime, currentDate, currentDay, currentMonth) => {
    const lowerCommand = command.toLowerCase();
    
    // Time related queries
    if (lowerCommand.includes('time')) {
        return {
            type: "get-time",
            userInput: command,
            response: `Current time is ${currentTime || 'not available right now'}`
        };
    }
    
    if (lowerCommand.includes('date')) {
        return {
            type: "get-date",
            userInput: command,
            response: `Today is ${currentDate || 'not available right now'}`
        };
    }
    
    if (lowerCommand.includes('day')) {
        return {
            type: "get-day", 
            userInput: command,
            response: `Today is ${currentDay || 'not available right now'}`
        };
    }
    
    if (lowerCommand.includes('month')) {
        return {
            type: "get-month",
            userInput: command,
            response: `Current month is ${currentMonth || 'not available right now'}`
        };
    }
    
    // App/service queries
    if (lowerCommand.includes('youtube')) {
        return {
            type: "youtube-search",
            userInput: command.replace(new RegExp(assistantName, 'gi'), '').trim(),
            response: "Opening YouTube for you"
        };
    }
    
    if (lowerCommand.includes('google')) {
        return {
            type: "google-search",
            userInput: command.replace(new RegExp(assistantName, 'gi'), '').trim(),
            response: "Searching on Google"
        };
    }
    
    if (lowerCommand.includes('calculator')) {
        return {
            type: "calculator-open",
            userInput: command,
            response: "Opening calculator"
        };
    }
    
    if (lowerCommand.includes('instagram')) {
        return {
            type: "instagram-open",
            userInput: command,
            response: "Opening Instagram"
        };
    }
    
    if (lowerCommand.includes('facebook')) {
        return {
            type: "facebook-open",
            userInput: command,
            response: "Opening Facebook"
        };
    }
    
    if (lowerCommand.includes('weather')) {
        return {
            type: "weather-show",
            userInput: command,
            response: "Showing weather information"
        };
    }
    
    // Greetings
    if (lowerCommand.includes('hello') || lowerCommand.includes('hi') || lowerCommand.includes('hey')) {
        return {
            type: "general",
            userInput: command,
            response: "Hello! How can I help you today?"
        };
    }
    
    // Default fallback
    return {
        type: "general",
        userInput: command,
        response: "I'm having trouble understanding. Could you please try again?"
    };
};

export default geminiResponse;