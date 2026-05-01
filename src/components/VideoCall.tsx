import { useEffect, useRef, useState } from 'react';
import * as SimplePeerNamespace from 'simple-peer';
import { Buffer } from 'buffer';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import { PhoneOff, Mic, MicOff, Camera, CameraOff } from 'lucide-react';

// Explicitly inject into window for SimplePeer internals
if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
  // @ts-ignore
  if (!window.process) window.process = { env: {}, version: 'v16.0.0', nextTick: (fn: any) => setTimeout(fn, 0) };
}

interface VideoCallProps {
  callerId: string;
  recipientId: string;
  onClose: () => void;
}

export default function VideoCall({ callerId, recipientId, onClose }: VideoCallProps) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const userVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<any>(null);

  useEffect(() => {
    let localStream: MediaStream;
    
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        localStream = currentStream;
        setStream(currentStream);
        if (userVideo.current) {
          userVideo.current.srcObject = currentStream;
        }
        setupPeer(currentStream);
      })
      .catch(err => {
        console.error("Camera access denied or error:", err);
        alert("Camera/Microphone access is required for video calls.");
        onClose();
      });

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
    };
  }, []);

  const setupPeer = (currentStream: MediaStream) => {
    const isCaller = callerId !== recipientId;
    
    // Most reliable way to get the constructor across different build environments
    const Peer = (SimplePeerNamespace as any).default || SimplePeerNamespace;
    
    try {
      const peer = new Peer({
        initiator: isCaller,
        trickle: false,
        stream: currentStream,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
      });

      peer.on('signal', async (data: any) => {
        await addDoc(collection(db, 'calls'), {
          type: isCaller ? 'offer' : 'answer',
          from: callerId,
          to: recipientId,
          data: JSON.stringify(data),
          timestamp: serverTimestamp(),
        });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        setRemoteStream(remoteStream);
        if (remoteVideo.current) {
          remoteVideo.current.srcObject = remoteStream;
        }
      });

      peerRef.current = peer;

      const q = query(
        collection(db, 'calls'),
        where('to', '==', callerId),
        where('from', '==', recipientId)
      );

      const unsub = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const signal = JSON.parse(change.doc.data().data);
            if (peer && !peer.destroyed) {
              peer.signal(signal);
            }
          }
        });
      });

      return () => unsub();
    } catch (e) {
      console.error("Peer connection failed:", e);
    }
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !isCameraOff;
      setIsCameraOff(!isCameraOff);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#050505] flex flex-col items-center justify-center p-4"
    >
      <div className="relative w-full max-w-5xl aspect-video bg-white/5 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {/* Remote Video */}
        <video
          playsInline
          ref={remoteVideo}
          autoPlay
          className="w-full h-full object-cover"
        />
        
        {/* Local Video */}
        <div className="absolute bottom-8 right-8 w-1/4 aspect-video bg-black rounded-2xl overflow-hidden border-2 border-cyan-500/50 shadow-xl">
           <video
            playsInline
            muted
            ref={userVideo}
            autoPlay
            className="w-full h-full object-cover mirror"
          />
        </div>

        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-cyan-400 font-bold tracking-widest uppercase text-sm">Awaiting Signal...</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center space-x-6">
          <button 
            onClick={toggleMute}
            className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {isMuted ? <MicOff size={28} /> : <Mic size={28} />}
          </button>
          <button 
            onClick={onClose}
            className="p-6 bg-red-600 hover:bg-red-500 text-white rounded-full transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] active:scale-95"
          >
            <PhoneOff size={32} />
          </button>
          <button 
            onClick={toggleCamera}
            className={`p-4 rounded-full transition-all ${isCameraOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}
          >
            {isCameraOff ? <CameraOff size={28} /> : <Camera size={28} />}
          </button>
        </div>
      </div>
      
      <p className="mt-8 text-white/20 text-[10px] uppercase tracking-[0.5em] font-bold">Secure Peer-to-Peer Connection by Senpai Ronzai</p>
    </motion.div>
  );
}
