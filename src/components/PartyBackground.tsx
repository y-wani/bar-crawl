import React, { useRef, useEffect, useState } from 'react';

export default function PartyBackground() {
  const [audioData, setAudioData] = useState<number[]>([]);
  const [isListening, setIsListening] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Initialize audio context and microphone
  const startAudioCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current.fftSize = 256;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      microphoneRef.current.connect(analyserRef.current);
      setIsListening(true);

      const updateAudioData = () => {
        if (analyserRef.current && isListening) {
          analyserRef.current.getByteFrequencyData(dataArray);
          setAudioData(Array.from(dataArray));
          requestAnimationFrame(updateAudioData);
        }
      };
      
      updateAudioData();
    } catch (error) {
      console.log('Audio capture not available:', error);
    }
  };

  useEffect(() => {
    startAudioCapture();
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '20px',
          fontSize: '12px',
        }}
      >
        {isListening ? '🎤 Audio Active' : '🎵 Audio Ready'}
      </div>
      <div
        style={{
          position: 'absolute',
          top: '50px',
          right: '10px',
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          padding: '8px',
          borderRadius: '8px',
          width: '100px',
          height: '50px',
        }}
      >
        {audioData.slice(0, 8).map((value, index) => (
          <div
            key={index}
            style={{
              width: '8px',
              height: `${(value / 255) * 40}px`,
              background: `hsl(${index * 45}, 70%, 60%)`,
              margin: '1px',
              display: 'inline-block',
              transition: 'height 0.1s ease',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: -1,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: `radial-gradient(circle at 50% 50%, 
              rgba(255, 105, 180, ${audioData[0] ? audioData[0] / 255 * 0.3 : 0.1}) 0%, 
              rgba(139, 92, 246, ${audioData[1] ? audioData[1] / 255 * 0.2 : 0.05}) 50%, 
              rgba(24, 18, 43, 0.8) 100%)`,
            transition: 'background 0.1s ease',
          }}
        />
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: `${Math.random() * 6 + 2}px`,
              height: `${Math.random() * 6 + 2}px`,
              background: `hsl(${Math.random() * 360}, 70%, 60%)`,
              borderRadius: '50%',
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 3 + 2}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
              opacity: audioData[i] ? audioData[i] / 255 : 0.3,
              transform: `scale(${audioData[i] ? audioData[i] / 255 + 0.5 : 1})`,
              transition: 'all 0.1s ease',
            }}
          />
        ))}
      </div>
      <style>
        {`
          @keyframes float {
            0%, 100% { transform: translateY(0px) scale(1); }
            50% { transform: translateY(-20px) scale(1.1); }
          }
        `}
      </style>
    </div>
  );
} 