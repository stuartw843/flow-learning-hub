import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { FaMicrophone } from 'react-icons/fa';
import { FlowClient } from "@speechmatics/flow-client";

interface EditorProps {
  moduleId: number;
  content: string;
  plainContent: string;
  style: string;
  persona: string;
  title: string;
  onChange: (content: string, plainContent?: string, style?: string, persona?: string) => void;
  editMode: boolean;
}

interface TranscriptData {
  text: string;
  is_final: boolean;
}

interface ErrorData {
  message: string;
}

const SAMPLE_RATE = 16000;
const flowClient = new FlowClient('wss://flow.api.speechmatics.com', { appId: "example" });

function Editor({ moduleId, content, plainContent, style, persona, title, onChange, editMode }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isLoadingRef = useRef(false);
  const lastContentRef = useRef(content);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [localPlainContent, setLocalPlainContent] = useState(plainContent || '');
  const [localStyle, setLocalStyle] = useState(style || '');
  const [localPersona, setLocalPersona] = useState(persona || '');
  const [activeTab, setActiveTab] = useState('context');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [mediaStream, setMediaStream] = useState<MediaStream>();
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isProcessingRef = useRef<boolean>(false);
  const messageHandlerRef = useRef<((event: any) => void) | null>(null);
  const audioHandlerRef = useRef<((event: any) => void) | null>(null);

  // Reset local state when module changes
  useEffect(() => {
    isLoadingRef.current = true;
    setLocalPlainContent(plainContent || '');
    setLocalStyle(style || '');
    setLocalPersona(persona || '');
    setSaveStatus('saved');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    lastContentRef.current = content;
    // Reset loading flag after state updates
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [moduleId, plainContent, style, persona]);

  const processAudioQueue = useCallback(async () => {
    if (isProcessingRef.current || !playbackContextRef.current || audioQueueRef.current.length === 0) {
      return;
    }

    isProcessingRef.current = true;
    const currentTime = playbackContextRef.current.currentTime;
    
    while (audioQueueRef.current.length > 0) {
      const audioData = audioQueueRef.current[0];
      const buffer = playbackContextRef.current.createBuffer(1, audioData.length, SAMPLE_RATE);
      const channelData = buffer.getChannelData(0);
      
      // Convert Int16 to Float32
      for (let i = 0; i < audioData.length; i++) {
        channelData[i] = audioData[i] / 32768;
      }

      const source = playbackContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackContextRef.current.destination);

      const startTime = Math.max(currentTime, nextPlayTimeRef.current);
      source.start(startTime);
      
      nextPlayTimeRef.current = startTime + buffer.duration;
      audioQueueRef.current.shift();

      // If we're too far ahead, break and wait
      if (nextPlayTimeRef.current > currentTime + 0.2) {
        break;
      }
    }

    isProcessingRef.current = false;
    
    // If there are still items in the queue, schedule the next processing
    if (audioQueueRef.current.length > 0) {
      setTimeout(() => processAudioQueue(), 100);
    }
  }, []);

  const queueAudio = useCallback((audioData: Int16Array) => {
    if (!playbackContextRef.current) {
      playbackContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;
    }

    audioQueueRef.current.push(audioData);
    processAudioQueue();
  }, [processAudioQueue]);

  const startRecording = useCallback(async (context: AudioContext, deviceId?: string) => {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: deviceId ? { deviceId: { exact: deviceId } } : true 
    });
    
    await context.audioWorklet.addModule('/src/audio-processor.js');
    const source = context.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(context, 'audio-processor');
    
    workletNode.port.onmessage = (event) => {
      flowClient.sendAudio(event.data);
    };

    source.connect(workletNode);
    workletNodeRef.current = workletNode;
    
    return stream;
  }, []);

  const stopRecording = useCallback(() => {
    if (workletNodeRef.current) {
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(undefined);
    }
  }, [mediaStream]);

  const startSession = useCallback(async () => {
    try {
      console.log('Fetching credentials...');
      const resp = await fetch('http://localhost:3001/api/speechmatics-credentials', {
        method: 'POST'
      });
      
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(`Failed to fetch credentials: ${errorData.details || resp.statusText}`);
      }
      
      const { token } = await resp.json();
      console.log('Credentials received, starting conversation...');

      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      setAudioContext(context);

      const messageHandler = (event: any) => {
        if (event.type === 'transcript') {
          const transcript = event.data as unknown as TranscriptData;
          if (transcript.is_final) {
            console.log('Final transcript:', transcript.text);
            setLocalPlainContent(prev => prev + ' ' + transcript.text);
          } else {
            console.log('Interim transcript:', transcript.text);
          }
        } else if (event.type === 'error') {
          const errorData = event.data as ErrorData;
          console.error('Flow client error:', errorData);
          setError(`Flow client error: ${errorData.message || 'Unknown error'}`);
        }
      };

      const audioHandler = (event: any) => {
        queueAudio(event.data);
      };

      messageHandlerRef.current = messageHandler;
      audioHandlerRef.current = audioHandler;

      flowClient.addEventListener("message", messageHandler);
      flowClient.addEventListener("agentAudio", audioHandler);

      await flowClient.startConversation(token, {
        config: {
          template_id: "flow-service-assistant-humphrey",
          template_variables: {
            context: plainContent || '',
            persona: persona || '',
            style: style || '',
          },
        },
        audioFormat: {
          type: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: SAMPLE_RATE,
        },
      });

      const stream = await startRecording(context);
      setMediaStream(stream);
      setIsListening(true);
      setError(null);
    } catch (error) {
      console.error('Error starting session:', error);
      setError(error instanceof Error ? error.message : 'Failed to start conversation');
      setIsListening(false);
    }
  }, [startRecording, queueAudio, plainContent, style, persona]);

  const stopSession = useCallback(async () => {
    // Remove event listeners
    if (messageHandlerRef.current) {
      flowClient.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (audioHandlerRef.current) {
      flowClient.removeEventListener("agentAudio", audioHandlerRef.current);
      audioHandlerRef.current = null;
    }

    // End conversation and cleanup audio resources
    flowClient.endConversation();
    stopRecording();

    if (audioContext?.state !== 'closed') {
      await audioContext?.close();
      setAudioContext(undefined);
    }

    if (playbackContextRef.current?.state !== 'closed') {
      await playbackContextRef.current?.close();
      playbackContextRef.current = null;
    }

    // Clear audio queue and reset flags
    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isProcessingRef.current = false;
    setIsListening(false);
    setError(null);
  }, [stopRecording, audioContext]);

  const handleVoiceClick = () => {
    if (isListening) {
      stopSession();
    } else {
      startSession();
    }
  };

  // Initialize Quill
  useEffect(() => {
    if (!editorRef.current) return;

    // Clean up existing instance if it exists
    if (quillRef.current) {
      quillRef.current.off('text-change');
      // Remove all Quill-related elements
      while (editorRef.current.firstChild) {
        editorRef.current.removeChild(editorRef.current.firstChild);
      }
      quillRef.current = null;
    }

    // Create fresh editor div
    const editorDiv = document.createElement('div');
    editorRef.current.appendChild(editorDiv);
    const toolbarOptions = [
      ['bold', 'italic', 'underline', 'strike'],
      ['blockquote', 'code-block'],
      [{ 'header': 1 }, { 'header': 2 }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'script': 'sub'}, { 'script': 'super' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'direction': 'rtl' }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'font': [] }],
      [{ 'align': [] }],
      ['clean']
    ];

    const quill = new Quill(editorDiv, {
      modules: {
        toolbar: editMode ? toolbarOptions : false
      },
      theme: 'snow',
      placeholder: editMode ? 'Start writing your content...' : '',
      readOnly: !editMode
    });

    quillRef.current = quill;
    
    // Set initial content
    isLoadingRef.current = true;
    quill.root.innerHTML = content;
    lastContentRef.current = content;
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);

    const handleTextChange = () => {
      if (!editMode || isLoadingRef.current) return;
      
      setSaveStatus('saving');
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = setTimeout(() => {
        // Only update the HTML content, keep other values unchanged
        onChange(quill.root.innerHTML);
        setSaveStatus('saved');
      }, 1000);
    };

    quill.on('text-change', handleTextChange);

    return () => {
      if (quillRef.current) {
        quillRef.current.off('text-change');
      }
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [moduleId, editMode]);

  // Update content when it changes externally
  useEffect(() => {
    if (!quillRef.current || content === lastContentRef.current) return;

    const quill = quillRef.current;
    const selection = quill.getSelection();
    
    isLoadingRef.current = true;
    quill.root.innerHTML = content;
    lastContentRef.current = content;
    
    // Restore selection if it existed
    if (selection) {
      setTimeout(() => {
        quill.setSelection(selection);
        isLoadingRef.current = false;
      }, 0);
    } else {
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
    }
  }, [content]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isListening) {
        stopSession();
      }
    };
  }, [isListening, stopSession]);

  const handlePlainContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editMode || isLoadingRef.current) return;
    
    const newContent = e.target.value;
    setLocalPlainContent(newContent);
    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onChange(quillRef.current?.root.innerHTML || '', newContent, localStyle, localPersona);
      setSaveStatus('saved');
    }, 1000);
  };

  const handleStyleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editMode || isLoadingRef.current) return;
    
    const newStyle = e.target.value;
    setLocalStyle(newStyle);
    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onChange(quillRef.current?.root.innerHTML || '', localPlainContent, newStyle, localPersona);
      setSaveStatus('saved');
    }, 1000);
  };

  const handlePersonaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editMode || isLoadingRef.current) return;
    
    const newPersona = e.target.value;
    setLocalPersona(newPersona);
    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onChange(quillRef.current?.root.innerHTML || '', localPlainContent, localStyle, newPersona);
      setSaveStatus('saved');
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full relative">
      <style>
        {`
          .ql-container {
            font-size: 16px;
            height: 90% !important;
          }
          .ql-toolbar {
            display: ${editMode ? 'block' : 'none'};
            border-top: none !important;
            border-left: none !important;
            border-right: none !important;
            border-bottom: 1px solid #e5e7eb !important;
            background-color: #f9fafb;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .editor-box{
            min-height:70%
          }
          .ql-editor {
            padding: 1.5rem;
            min-height: 60%;
          }
          .ql-editor.ql-blank::before {
            display: ${editMode ? 'block' : 'none'};
          }
          .save-status {
            position: fixed;
            top: 7rem;
            right: 4rem;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            color: #4b5563;
            background-color: ${saveStatus === 'saving' ? '#fef3c7' : '#f3f4f6'};
            transition: opacity 150ms ease-in-out;
            display: ${editMode ? 'block' : 'none'};
            z-index: 20;
          }
          .tab-active {
            color: #4f46e5;
            border-bottom: 2px solid #4f46e5;
          }
          .tab-content {
            height: calc(100vh - 13rem);
            overflow-y: auto;
          }
        `}
      </style>
      {!editMode && plainContent && (
        <div className="flex items-center gap-2 p-4 border-b border-gray-200">
          <button
            onClick={handleVoiceClick}
            className={`p-2 rounded-full ${
              isListening ? 'bg-red-500' : 'bg-blue-500'
            } text-white hover:opacity-80 transition-opacity`}
            title={error || (isListening ? 'Stop conversation' : 'Start conversation')}
          >
            <FaMicrophone className="w-5 h-5" />
          </button>
          <span className="text-gray-700 font-medium">Click To Start Voice Simulated Scenario</span>
          {error && (
            <div className="ml-4 p-2 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
        </div>
      )}
      <div ref={editorRef} className="flex-1 editor-box" />
      
      {editMode && (
        <div className="border-t border-gray-200">
          <h2 className="text-xl font-bold px-4 py-3 border-b border-gray-200">Voice interaction scenario:</h2>
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('context')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'context' ? 'tab-active' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Context
            </button>
            {/* <button
              onClick={() => setActiveTab('style')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'style' ? 'tab-active' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Style
            </button> */}
            <button
              onClick={() => setActiveTab('persona')}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === 'persona' ? 'tab-active' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Persona
            </button>
          </div>
          <div className="tab-content">
            {activeTab === 'context' && (
              <textarea
                key={`plain-${moduleId}`}
                value={localPlainContent}
                onChange={handlePlainContentChange}
                className="w-full h-full p-6 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add context here..."
              />
            )}
            {/* {activeTab === 'style' && (
              <textarea
                key={`style-${moduleId}`}
                value={localStyle}
                onChange={handleStyleChange}
                className="w-full h-full p-6 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add style here..."
              />
            )} */}
            {activeTab === 'persona' && (
              <textarea
                key={`persona-${moduleId}`}
                value={localPersona}
                onChange={handlePersonaChange}
                className="w-full h-full p-6 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Add persona here..."
              />
            )}
          </div>
        </div>
      )}
      {editMode && (
        <div className="save-status">
          {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
        </div>
      )}
    </div>
  );
}

export default Editor;
