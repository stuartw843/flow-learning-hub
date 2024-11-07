import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { FaMicrophone } from 'react-icons/fa';
import { FlowClient } from "@speechmatics/flow-client";

interface EditorProps {
  moduleId: number;
  content: string;
  plainContent: string;
  title: string;
  onChange: (content: string, plainContent?: string) => void;
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

function Editor({ moduleId, content, plainContent, title, onChange, editMode }: EditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();
  const isLoadingRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [localPlainContent, setLocalPlainContent] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext>();
  const [mediaStream, setMediaStream] = useState<MediaStream>();
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const audioQueueRef = useRef<Int16Array[]>([]);
  const isProcessingRef = useRef<boolean>(false);

  // Reset local state when module changes
  useEffect(() => {
    isLoadingRef.current = true;
    setLocalPlainContent(plainContent || '');
    setSaveStatus('saved');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Reset loading flag after state updates
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 0);
  }, [moduleId]);

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

      flowClient.addEventListener("message", (event) => {
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
      });

      flowClient.addEventListener("agentAudio", (event) => {
        queueAudio(event.data);
      });

      await flowClient.startConversation(token, {
        config: {
          template_id: "flow-service-assistant-amelia",
          template_variables: {},
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
  }, [startRecording, queueAudio]);

  const stopSession = useCallback(async () => {
    flowClient.endConversation();
    stopRecording();
    await audioContext?.close();
    await playbackContextRef.current?.close();
    playbackContextRef.current = null;
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
        onChange(quill.root.innerHTML, localPlainContent);
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
    if (quillRef.current && content !== quillRef.current.root.innerHTML) {
      isLoadingRef.current = true;
      quillRef.current.root.innerHTML = content;
      setTimeout(() => {
        isLoadingRef.current = false;
      }, 0);
    }
  }, [content]);

  const handlePlainContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editMode || isLoadingRef.current) return;
    
    const newContent = e.target.value;
    setLocalPlainContent(newContent);
    setSaveStatus('saving');
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      onChange(quillRef.current?.root.innerHTML || '', newContent);
      setSaveStatus('saved');
    }, 1000);
  };

  return (
    <div className="flex flex-col h-full relative">
      <style>
        {`
          .ql-container {
            font-size: 16px;
            height: ${editMode ? 'calc(80%)' : '100%'} !important;
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
          .ql-editor {
            padding: 1.5rem;
            min-height: 100%;
          }
          .ql-editor.ql-blank::before {
            display: ${editMode ? 'block' : 'none'};
          }
          .save-status {
            position: fixed;
            top: 7rem;
            right: 1rem;
            padding: 0.5rem 1rem;
            border-radius: 0.375rem;
            font-size: 0.875rem;
            color: #4b5563;
            background-color: ${saveStatus === 'saving' ? '#fef3c7' : '#f3f4f6'};
            transition: opacity 150ms ease-in-out;
            display: ${editMode ? 'block' : 'none'};
          }
        `}
      </style>
      <div ref={editorRef} className="h-3/4" />
      {!editMode && plainContent && (
        <div className="relative">
          <button
            onClick={handleVoiceClick}
            className={`absolute right-6 -top-3 p-2 rounded-full ${
              isListening ? 'bg-red-500' : 'bg-blue-500'
            } text-white hover:opacity-80 transition-opacity`}
            title={error || (isListening ? 'Stop conversation' : 'Start conversation')}
          >
            <FaMicrophone className="w-5 h-5" />
          </button>
          {error && (
            <div className="absolute right-6 top-6 p-2 bg-red-100 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          <div className="h-1/2 p-6 border-t border-gray-200 whitespace-pre-wrap">
            {plainContent}
          </div>
        </div>
      )}
      {editMode && (
        <textarea
          key={moduleId}
          value={localPlainContent}
          onChange={handlePlainContentChange}
          className="h-1/4 p-6 border-t border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Add plain text content here..."
        />
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
