import React, { useContext, useEffect, useRef, useState } from 'react'
import { userDataContext } from '../context/UserContext'

import axios from 'axios'
import aiImg from "../assets/ai.gif"
import { CgMenuRight } from "react-icons/cg";
import { RxCross1 } from "react-icons/rx";
import userImg from "../assets/user.gif"
import { useNavigate } from 'react-router-dom'

function Home() {
  const {userData, serverUrl, setUserData, getGeminiResponse} = useContext(userDataContext)
  const navigate = useNavigate()
  const [listening, setListening] = useState(false)
  const [userText, setUserText] = useState("")
  const [aiText, setAiText] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("connected")
  const isSpeakingRef = useRef(false)
  const recognitionRef = useRef(null)
  const [ham, setHam] = useState(false)
  const isRecognizingRef = useRef(false)
  const [speechUnlocked, setSpeechUnlocked] = useState(false)
  const synth = window.speechSynthesis

  // Add cooldown mechanism to prevent multiple rapid commands
  const lastCommandTimeRef = useRef(0)
  const COMMAND_COOLDOWN = 3000 // 3 seconds cooldown between commands

  const handleLogOut = async () => {
    try {
      const result = await axios.get(`${serverUrl}/api/auth/logout`, {withCredentials: true})
      setUserData(null)
      navigate("/signin")
    } catch (error) {
      setUserData(null)
      console.log(error)
    }
  }

  const startRecognition = () => {
    if (!isSpeakingRef.current && !isRecognizingRef.current && !isProcessing) {
      try {
        recognitionRef.current?.start();
        console.log("🎤 Recognition requested to start");
      } catch (error) {
        if (error.name !== "InvalidStateError") {
          console.error("❌ Start error:", error);
        }
      }
    }
  }

  // Improved speech unlock function - must be called from user interaction
  const unlockSpeechSynthesis = async () => {
    if (speechUnlocked) return true;
    
    console.log("🔓 Attempting to unlock speech synthesis");
    
    return new Promise((resolve) => {
      try {
        // Create a very short utterance with actual text
        const utterance = new SpeechSynthesisUtterance('Ready');
        utterance.volume = 0.1;
        utterance.rate = 2;
        utterance.pitch = 1;
        
        let resolved = false;
        
        utterance.onstart = () => {
          console.log("🔓 Speech synthesis unlocked successfully");
          if (!resolved) {
            resolved = true;
            setSpeechUnlocked(true);
            resolve(true);
          }
        };
        
        utterance.onend = () => {
          console.log("🔓 Speech unlock test completed");
          if (!resolved) {
            resolved = true;
            setSpeechUnlocked(true);
            resolve(true);
          }
        };
        
        utterance.onerror = (event) => {
          console.error("❌ Failed to unlock speech:", event.error);
          if (!resolved) {
            resolved = true;
            if (event.error === 'not-allowed') {
              console.log("❌ Speech blocked by browser - need direct user interaction");
            }
            resolve(false);
          }
        };
        
        // Try to speak
        synth.speak(utterance);
        
        // Timeout fallback
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            synth.cancel();
            // Check if speech synthesis is available
            const available = synth.getVoices().length > 0;
            console.log("🔓 Timeout - Speech available:", available);
            setSpeechUnlocked(available);
            resolve(available);
          }
        }, 2000);
        
      } catch (error) {
        console.error("❌ Exception in unlock:", error);
        resolve(false);
      }
    });
  };

  const speak = async (text) => {
    console.log("🔊 Attempting to speak:", text);
    
    if (!text || text.trim() === "") {
      console.log("❌ No text to speak");
      setIsProcessing(false);
      setTimeout(() => startRecognition(), 1000);
      return;
    }

    // Check if speech is unlocked - if not, skip speech but continue processing
    if (!speechUnlocked) {
      console.log("⚠️ Speech not unlocked, skipping speech output");
      setIsProcessing(false);
      setTimeout(() => startRecognition(), 1000);
      return;
    }

    const synth = window.speechSynthesis;

    // Cancel any ongoing speech
    synth.cancel();

    // Wait for cancel to complete and voices to load
    await new Promise(resolve => {
      const checkVoices = () => {
        const voices = synth.getVoices();
        if (voices.length > 0) {
          resolve();
        } else {
          setTimeout(checkVoices, 100);
        }
      };
      setTimeout(checkVoices, 150);
    });

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set language and voice properties
      utterance.lang = 'en-US';
      utterance.rate = 0.85;
      utterance.pitch = 1;
      utterance.volume = 0.9;

      // Get and set voice
      const voices = synth.getVoices();
      console.log("Available voices:", voices.length);
      
      if (voices.length > 0) {
        let selectedVoice = voices.find(v => 
          v.lang.toLowerCase().includes('en-us') && 
          (v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('enhanced'))
        ) || voices.find(v => v.lang.toLowerCase().includes('en-us')) 
          || voices.find(v => v.lang.toLowerCase().includes('en'))
          || voices[0];
        
        utterance.voice = selectedVoice;
        console.log("Using voice:", selectedVoice.name, selectedVoice.lang);
      }

      isSpeakingRef.current = true;

      utterance.onstart = () => {
        console.log("🔊 Started speaking successfully");
      };

      utterance.onend = () => {
        console.log("🔇 Finished speaking");
        setAiText("");
        isSpeakingRef.current = false;
        setIsProcessing(false);
        setTimeout(() => startRecognition(), 1500);
      };

      utterance.onerror = (event) => {
        console.error("❌ Speech synthesis error:", event.error, event);
        isSpeakingRef.current = false;
        setIsProcessing(false);
        
        if (event.error === 'not-allowed') {
          console.log("⚠️ Speech not allowed - resetting speech unlock");
          setSpeechUnlocked(false);
          // Don't show alert during automated speech
        }
        
        setTimeout(() => startRecognition(), 1500);
      };

      // Speak the utterance
      synth.speak(utterance);
      console.log("Speech synthesis initiated successfully");
      
    } catch (error) {
      console.error("❌ Failed to initiate speech:", error);
      isSpeakingRef.current = false;
      setIsProcessing(false);
      setTimeout(() => startRecognition(), 1500);
    }
  };

  // Handle user interaction to unlock speech
  const handleUserInteraction = async (e) => {
    // Only try to unlock on direct clicks, not during automated processes
    if (!speechUnlocked && !isProcessing) {
      console.log("🔓 User interaction detected, attempting to unlock speech");
      await unlockSpeechSynthesis();
    }
  };

  // Explicit enable speech button handler
  const handleEnableSpeech = async (e) => {
    e.stopPropagation(); // Prevent event bubbling
    console.log("🔓 Explicit speech enable requested");
    const unlocked = await unlockSpeechSynthesis();
    if (unlocked) {
      console.log("✅ Speech unlocked successfully");
      // Test speech with a direct user interaction
      setTimeout(() => {
        speak("Speech is now enabled. I'm ready to help you!");
      }, 100);
    } else {
      console.log("❌ Failed to unlock speech");
      alert("Unable to enable speech. Please make sure your browser allows audio playback.");
    }
  };

  const handleCommand = async (data) => {
    const { type, userInput, response } = data;
    console.log("🤖 Handling command:", { type, userInput, response });

    // Display response immediately
    setAiText(response);

    // Try to speak the response if speech is enabled
    if (speechUnlocked) {
      await speak(response);
    } else {
      console.log("🔇 Speech not unlocked, showing text only");
      // If speech is not available, just continue without speech
      setIsProcessing(false);
      setTimeout(() => startRecognition(), 1500);
    }
    
    console.log('type', type)

    // Add a small delay before opening URLs
    setTimeout(() => {
      switch (type) {
        case 'google-search':
          window.open(`https://www.google.com/search?q=${encodeURIComponent(userInput)}`, '_blank');
          break;

        case 'calculator-open':
          window.open(`https://www.google.com/search?q=calculator`, '_blank');
          break;

        case 'instagram-open':
          window.open(`https://www.instagram.com/`, '_blank');
          break;

        case 'facebook-open':
          window.open(`https://www.facebook.com/`, '_blank');
          break;

        case 'weather-show':
          window.open(`https://www.google.com/search?q=weather`, '_blank');
          break;

        case 'youtube-search':
        case 'youtube-play':
          window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(userInput)}`, '_blank');
          break;

        case 'get-time':
        case 'get-date':
        case 'get-day':
        case 'get-month':
        case 'general':
        default:
          // No URL to open for these types
          break;
      }
    }, speechUnlocked ? 500 : 100); // Shorter delay if no speech
  };

  const processUserCommand = async (transcript) => {
    try {
      // Check cooldown period
      const currentTime = Date.now();
      if (currentTime - lastCommandTimeRef.current < COMMAND_COOLDOWN) {
        console.log("🕐 Command ignored due to cooldown");
        return;
      }
      
      // Update last command time
      lastCommandTimeRef.current = currentTime;
      
      setIsProcessing(true);
      setConnectionStatus("connected");
      
      console.log("🎤 Processing command:", transcript);
      const data = await getGeminiResponse(transcript);
      console.log('geminiresponse', data);
      
      if (data && data.response) {
        await handleCommand(data);
        setAiText(data.response);
        setConnectionStatus("connected");
      } else {
        throw new Error("Invalid response from AI");
      }
      
    } catch (error) {
      console.error("❌ Error processing command:", error);
      setConnectionStatus("error");
      setIsProcessing(false);
      
      // Fallback response
      const fallbackResponse = "I'm sorry, I'm having trouble right now. Please try again.";
      setAiText(fallbackResponse);
      await speak(fallbackResponse);
    }
  }

  useEffect(() => {
    // Early return if userData is not available
    if (!userData || !userData.assistantName) {
      console.log("Waiting for userData...");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.error("❌ Speech recognition not supported");
      setConnectionStatus("error");
      return;
    }
    
    const recognition = new SpeechRecognition();

    recognition.continuous = false; // Changed to false to prevent multiple triggers
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;

    let isMounted = true;

    // Start recognition after delay
    const startTimeout = setTimeout(() => {
      if (isMounted && !isSpeakingRef.current && !isRecognizingRef.current && !isProcessing) {
        try {
          recognition.start();
          console.log("🎤 Initial recognition start");
        } catch (e) {
          if (e.name !== "InvalidStateError") {
            console.error("❌ Initial start error:", e);
          }
        }
      }
    }, 1500); // Increased delay

    recognition.onstart = () => {
      isRecognizingRef.current = true;
      setListening(true);
      console.log("🎤 Recognition started");
    };

    recognition.onend = () => {
      isRecognizingRef.current = false;
      setListening(false);
      console.log("🎤 Recognition ended");
      
      // Only restart if not processing and not speaking
      if (isMounted && !isSpeakingRef.current && !isProcessing) {
        setTimeout(() => {
          if (isMounted && !isProcessing) {
            try {
              recognition.start();
              console.log("🎤 Recognition restarted");
            } catch (e) {
              if (e.name !== "InvalidStateError") {
                console.error("❌ Restart error:", e);
              }
            }
          }
        }, 2000); // Increased restart delay
      }
    };

    recognition.onerror = (event) => {
      console.warn("⚠️ Recognition error:", event.error);
      isRecognizingRef.current = false;
      setListening(false);
      
      if (event.error === "network") {
        setConnectionStatus("disconnected");
      }
      
      // Only restart on certain errors and if not processing
      if (event.error !== "aborted" && event.error !== "no-speech" && 
          isMounted && !isSpeakingRef.current && !isProcessing) {
        setTimeout(() => {
          if (isMounted && !isProcessing) {
            try {
              recognition.start();
              console.log("🎤 Recognition restarted after error");
            } catch (e) {
              if (e.name !== "InvalidStateError") {
                console.error("❌ Error restart failed:", e);
              }
            }
          }
        }, 3000); // Even longer delay after error
      }
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[event.results.length - 1][0].transcript.trim();
      console.log("🎤 Heard:", transcript);
      
      // Check if transcript contains assistant name or just process any command
      if (transcript.toLowerCase() && !isProcessing) {
        console.log("Command received");
        setAiText("");
        setUserText(transcript);
        
        // Stop recognition immediately to prevent multiple triggers
        try {
          recognition.stop();
        } catch (e) {
          console.log("Recognition already stopped");
        }
        
        isRecognizingRef.current = false;
        setListening(false);

        await processUserCommand(transcript);
        setUserText("");
      }
    };

    return () => {
      isMounted = false;
      clearTimeout(startTimeout);
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setListening(false);
      isRecognizingRef.current = false;
      window.speechSynthesis.cancel();
    };
  }, [userData, getGeminiResponse, isProcessing]);

  // Connection status indicator
  const getStatusColor = () => {
    switch(connectionStatus) {
      case "connected": return "bg-green-500";
      case "disconnected": return "bg-yellow-500";
      case "error": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch(connectionStatus) {
      case "connected": return "Connected";
      case "disconnected": return "Reconnecting...";
      case "error": return "Error";
      default: return "Unknown";
    }
  };

  // Don't render if userData is not loaded
  if (!userData) {
    return (
      <div className='w-full h-[100vh] bg-gradient-to-t from-[black] to-[#02023d] flex justify-center items-center'>
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div 
      className='w-full h-[100vh] bg-gradient-to-t from-[black] to-[#02023d] flex justify-center items-center flex-col gap-[15px] overflow-hidden'
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
    >
      {/* Status and Speech Controls */}
      <div className="absolute top-[20px] left-[20px] flex items-center gap-[10px] flex-wrap">
        <div className={`w-[10px] h-[10px] rounded-full ${getStatusColor()}`}></div>
        <span className="text-white text-[12px]">{getStatusText()}</span>
        
        {!speechUnlocked && (
          <button 
            onClick={handleEnableSpeech}
            className="bg-yellow-600 hover:bg-yellow-700 text-white text-[11px] px-2 py-1 rounded ml-2 transition-colors"
          >
            Enable Speech
          </button>
        )}
        
        {speechUnlocked && (
          <div className="flex items-center gap-1 ml-2">
            <div className="w-[8px] h-[8px] bg-green-500 rounded-full"></div>
            <span className="text-green-400 text-[10px]">Speech Ready</span>
          </div>
        )}
      </div>

      {/* Mobile menu button */}
      <CgMenuRight className='lg:hidden text-white absolute top-[20px] right-[20px] w-[25px] h-[25px]' onClick={() => setHam(true)}/>
      
      {/* Mobile menu */}
      <div className={`absolute lg:hidden top-0 w-full h-full bg-[#00000053] backdrop-blur-lg p-[20px] flex flex-col gap-[20px] items-start ${ham ? "translate-x-0" : "translate-x-full"} transition-transform`}>
        <RxCross1 className=' text-white absolute top-[20px] right-[20px] w-[25px] h-[25px]' onClick={() => setHam(false)}/>
        <button className='min-w-[150px] h-[60px] text-black font-semibold bg-red-600 rounded-full cursor-pointer text-[19px] ' onClick={handleLogOut}>Log Out</button>
        <button className='min-w-[150px] h-[60px] text-black font-semibold bg-white rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] ' onClick={() => navigate("/customize")}>Customize your Assistant</button>
        
        {/* Speech control in mobile menu */}
        {!speechUnlocked && (
          <button 
            onClick={handleEnableSpeech}
            className='min-w-[150px] h-[60px] text-black font-semibold bg-yellow-500 rounded-full cursor-pointer text-[19px] px-[20px] py-[10px]'
          >
            Enable Speech
          </button>
        )}

        <div className='w-full h-[2px] bg-gray-400'></div>
        <h1 className='text-white font-semibold text-[19px]'>History</h1>

        <div className='w-full h-[400px] gap-[20px] overflow-y-auto flex flex-col truncate'>
          {userData.history?.map((his, index) => (
            <div key={index} className='text-gray-200 text-[18px] w-full h-[30px]'>{his}</div>
          ))}
        </div>
      </div>

      {/* Desktop buttons */}
      <button className='min-w-[150px] h-[60px] mt-[30px] text-black font-semibold absolute hidden lg:block top-[20px] right-[20px] bg-white rounded-full cursor-pointer text-[19px] ' onClick={handleLogOut}>Log Out</button>
      <button className='min-w-[150px] h-[60px] mt-[30px] text-black font-semibold bg-white absolute top-[100px] right-[20px] rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] hidden lg:block ' onClick={() => navigate("/customize")}>Customize your Assistant</button>
      
      {/* Enable Speech button for desktop */}
      {!speechUnlocked && (
        <button 
          onClick={handleEnableSpeech}
          className='min-w-[150px] h-[60px] mt-[30px] text-black font-semibold bg-yellow-500 absolute top-[180px] right-[20px] rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] hidden lg:block hover:bg-yellow-600 transition-colors'
        >
          Enable Speech
        </button>
      )}
      
      {/* Assistant image */}
      <div className='w-[300px] h-[400px] flex justify-center items-center overflow-hidden rounded-4xl shadow-lg'>
        <img src={userData?.assistantImage} alt="" className='h-full object-cover'/>
      </div>
      
      {/* Assistant name */}
      <h1 className='text-white text-[18px] font-semibold'>I'm {userData?.assistantName}</h1>
      
      {/* Status images */}
      {!aiText && !isProcessing && <img src={userImg} alt="" className='w-[200px]'/>}
      {(aiText || isProcessing) && <img src={aiImg} alt="" className='w-[200px]'/>}
    
      {/* Text display */}
      <div className="text-center px-[20px] max-w-[90%]">
        <h1 className='text-white text-[18px] font-semibold text-wrap'>
          {isProcessing ? "Processing..." : userText ? userText : aiText ? aiText : null}
        </h1>
        
        {/* Listening indicator */}
        {listening && !isProcessing && (
          <div className="mt-[10px] flex items-center justify-center gap-[5px]">
            <div className="w-[8px] h-[8px] bg-red-500 rounded-full animate-pulse"></div>
            <span className="text-red-500 text-[14px]">Listening...</span>
          </div>
        )}
      </div>

      {/* Speech status messages */}
      {!speechUnlocked && (
        <div className="absolute bottom-[40px] text-center text-yellow-400 text-[14px] px-[20px] bg-black bg-opacity-50 rounded p-2">
          <div className="mb-1">🔊 Speech responses disabled</div>
          <div className="text-[12px]">Click "Enable Speech" button to activate voice responses</div>
        </div>
      )}
      
      {speechUnlocked && (
        <div className="absolute bottom-[40px] text-center text-green-400 text-[12px] px-[20px] bg-black bg-opacity-50 rounded p-1">
          🔊 Speech enabled - Voice responses active
        </div>
      )}
    </div>
  )
}

export default Home