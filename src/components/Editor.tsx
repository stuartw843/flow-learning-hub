import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import type { Range } from 'quill';
import 'quill/dist/quill.snow.css';
import { FaMicrophone } from 'react-icons/fa';
import { FlowClient } from "@speechmatics/flow-client";
import { config } from '../config';
import ImageResize from 'quill-image-resize-module-react';

// Register the image resize module
Quill.register('modules/imageResize', ImageResize);

interface RangeStatic {
  index: number;
  length: number;
}

// Maximum image dimensions and size
const MAX_IMAGE_SIZE = 800;
const MAX_FILE_SIZE = 200 * 1024; // 200KB

interface KeyboardContext {
  format: {
    image?: boolean;
    [key: string]: any;
  };
  offset: number;
}

// Helper to check if base64 string is too large
const isBase64TooLarge = (base64String: string) => {
  // Remove data URL prefix to get actual base64 content
  const base64WithoutPrefix = base64String.split(',')[1];
  const stringLength = base64WithoutPrefix.length;
  const sizeInBytes = 4 * Math.ceil((stringLength / 3))*0.5624896334383812;
  return sizeInBytes > MAX_FILE_SIZE;
};

// Image compression function
const compressImage = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > MAX_IMAGE_SIZE) {
          height = Math.round((height * MAX_IMAGE_SIZE) / width);
          width = MAX_IMAGE_SIZE;
        }
      } else {
        if (height > MAX_IMAGE_SIZE) {
          width = Math.round((width * MAX_IMAGE_SIZE) / height);
          height = MAX_IMAGE_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      // Start with quality 0.5
      let quality = 0.5;
      let base64String = canvas.toDataURL('image/jpeg', quality);
      
      // If still too large, reduce quality until it fits
      while (isBase64TooLarge(base64String) && quality > 0.1) {
        quality -= 0.1;
        base64String = canvas.toDataURL('image/jpeg', quality);
      }

      if (isBase64TooLarge(base64String)) {
        reject(new Error('Image too large. Please use a smaller image.'));
        return;
      }

      URL.revokeObjectURL(img.src);
      resolve(base64String);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
  });
};

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

interface QuillToolbar {
  addHandler: (format: string, handler: () => void) => void;
}

const SAMPLE_RATE = 16000;
const flowClient = new FlowClient('wss://flow.api.speechmatics.com', { appId: "example" });

function Editor({ moduleId, content, plainContent, style, persona, title, onChange, editMode }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isLoadingRef = useRef(false);
  const lastContentRef = useRef(content);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [localPlainContent, setLocalPlainContent] = useState(plainContent || '');
  const [localStyle, setLocalStyle] = useState(style || '');
  const [localPersona, setLocalPersona] = useState(persona || '');
  const [activeTab, setActiveTab] = useState('context');
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [mediaStream, setMediaStream] = useState<MediaStream>();
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isProcessingRef = useRef<boolean>(false);
  const messageHandlerRef = useRef<((event: any) => void) | null>(null);
  const audioHandlerRef = useRef<((event: any) => void) | null>(null);

  // Clear image error after 5 seconds
  useEffect(() => {
    if (imageError) {
      const timer = setTimeout(() => {
        setImageError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [imageError]);

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
    if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
      playbackContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;
    }

    audioQueueRef.current.push(audioData);
    processAudioQueue();
  }, [processAudioQueue]);

  const startRecording = useCallback(async (context: AudioContext, deviceId?: string) => {
    try {
      console.log('Attempting to access user media...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: deviceId ? { deviceId: { exact: deviceId } } : true 
      });
      console.log('Microphone access granted, stream started.');

      console.log('Adding audio worklet module...');
      const modulePath = new URL('/audio-processor.js', import.meta.url).href;
      await context.audioWorklet.addModule(modulePath);
      console.log('Audio worklet module added.');

      const source = context.createMediaStreamSource(stream);
      const workletNode = new AudioWorkletNode(context, 'audio-processor');

      workletNode.port.onmessage = (event) => {
        flowClient.sendAudio(event.data);
      };

      source.connect(workletNode);
      workletNodeRef.current = workletNode;
      setMediaStream(stream);

      return stream;
    } catch (error) {
      console.error('Error in startRecording:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to start recording';
      setError(errorMessage);
      throw error;
    }
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
      await stopSession();
      
      setIsConnecting(true);
      setError(null);

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();

      console.log('Fetching credentials...');
      const resp = await fetch(`${config.apiBaseUrl}/speechmatics-credentials`, {
        method: 'POST',
        signal: abortControllerRef.current.signal
      });
      
      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(`Failed to fetch credentials: ${errorData.details || resp.statusText}`);
      }
      
      const { token } = await resp.json();
      console.log('Credentials received, starting conversation...');
      
      const context = new AudioContext({ sampleRate: SAMPLE_RATE });
      setAudioContext(context);

      if (playbackContextRef.current) {
        await playbackContextRef.current.close();
      }
      playbackContextRef.current = new AudioContext({ sampleRate: SAMPLE_RATE });
      nextPlayTimeRef.current = playbackContextRef.current.currentTime;
      audioQueueRef.current = [];

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
      console.log("started recording")
      setMediaStream(stream);
      setIsListening(true);
      setError(null);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Request was aborted');
      } else {
        console.error('Error starting session:', error);
        setError(error instanceof Error ? error.message : 'Failed to start conversation');
      }
      setIsListening(false);
    } finally {
      setIsConnecting(false);
      abortControllerRef.current = null;
    }
  }, [startRecording, queueAudio, plainContent, style, persona]);

  const stopSession = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (messageHandlerRef.current) {
      flowClient.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (audioHandlerRef.current) {
      flowClient.removeEventListener("agentAudio", audioHandlerRef.current);
      audioHandlerRef.current = null;
    }

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

    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    isProcessingRef.current = false;
    setIsListening(false);
    setError(null);

    await new Promise(resolve => setTimeout(resolve, 100));
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

    if (quillRef.current) {
      quillRef.current.off('text-change');
      while (editorRef.current.firstChild) {
        editorRef.current.removeChild(editorRef.current.firstChild);
      }
      quillRef.current = null;
    }

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
      ['image'],
      ['clean']
    ];

    const quill = new Quill(editorDiv, {
      modules: {
        toolbar: editMode ? toolbarOptions : false,
        imageResize: {
          modules: ['Resize']
        }
      },
      theme: 'snow',
      placeholder: editMode ? 'Start writing your content...' : '',
      readOnly: !editMode
    });

    // Add keyboard handler for image deletion
    quill.keyboard.addBinding({ key: 'Backspace' }, {}, function(range: RangeStatic, context: KeyboardContext) {
      if (context.format.image) {
        quill.deleteText(range.index - 1, 1);
      }
    });

    quill.keyboard.addBinding({ key: 'Delete' }, {}, function(range: RangeStatic, context: KeyboardContext) {
      if (context.format.image) {
        quill.deleteText(range.index, 1);
      }
    });

    // Handle image upload with compression
    if (editMode) {
      const toolbar = quill.getModule('toolbar') as QuillToolbar;
      toolbar.addHandler('image', () => {
        const input = document.createElement('input');
        input.setAttribute('type', 'file');
        input.setAttribute('accept', 'image/*');
        input.click();

        input.onchange = async () => {
          const file = input.files?.[0];
          if (file) {
            if (file.size > MAX_FILE_SIZE * 2) {
              setImageError('Image file is too large. Please select an image under 400KB.');
              return;
            }
            try {
              const compressedImage = await compressImage(file);
              const range = quill.getSelection(true);
              quill.insertEmbed(range.index, 'image', compressedImage);
            } catch (error) {
              console.error('Failed to process image:', error);
              setImageError(error instanceof Error ? error.message : 'Failed to process image');
            }
          }
        };
      });
    }

    quillRef.current = quill;
    
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

  useEffect(() => {
    if (!quillRef.current || content === lastContentRef.current) return;

    const quill = quillRef.current;
    const selection = quill.getSelection();
    
    isLoadingRef.current = true;
    quill.root.innerHTML = content;
    lastContentRef.current = content;
    
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

  useEffect(() => {
    return () => {
      if (isListening) {
        stopSession();
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
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
          .ql-editor img {
            max-width: 100%;
            height: auto;
            cursor: ${editMode ? 'pointer' : 'default'};
          }
          .ql-editor.ql-blank::before {
            display: ${editMode ? 'block' : 'none'};
          }
          .image-error {
            position: fixed;
            top: 7rem;
            right: 4rem;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            color: #dc2626;
            background-color: #fee2e2;
            border: 1px solid #fecaca;
            z-index: 30;
          }
          .save-status {
            position: fixed;
            top: ${imageError ? '11rem' : '7rem'};
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
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
          .mic-pulse {
            animation: pulse 1.5s infinite;
          }
          .mic-connecting {
            opacity: 0.7;
            cursor: wait;
          }
        `}
      </style>
      {imageError && (
        <div className="image-error">
          {imageError}
        </div>
      )}
      {!editMode && plainContent && (
        <div className="flex items-center gap-2 p-4 border-b border-gray-200">
          <button
            onClick={handleVoiceClick}
            disabled={isConnecting}
            className={`p-2 rounded-full ${
              isListening ? 'bg-red-500 mic-pulse' : isConnecting ? 'bg-gray-400 mic-connecting' : 'bg-blue-500'
            } text-white hover:opacity-80 transition-opacity relative`}
            title={error || (isConnecting ? 'Connecting...' : isListening ? 'Stop conversation' : 'Start conversation')}
          >
            <FaMicrophone className={`w-5 h-5 ${isConnecting ? 'opacity-50' : ''}`} />
          </button>
          <span className="text-gray-700 font-medium">
            {isConnecting ? 'Connecting...' : isListening ? 'Recording...' : 'Click To Start Voice Simulated Scenario'}
          </span>
          {error && (
            <div className="ml-4 p-2 bg-red-100 text-red-700 rounded text-sm flex items-center">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
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
