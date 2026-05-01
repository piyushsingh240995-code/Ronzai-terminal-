import React, { useState, useEffect, useRef } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
  Video, 
  Trash2, 
  Send, 
  Smile, 
  LogOut, 
  PlusCircle, 
  ShieldCheck, 
  Zap, 
  Activity, 
  Hash, 
  User, 
  Ghost,
  MoreVertical,
  X,
  Layers,
  ChevronRight
} from 'lucide-react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  deleteDoc, 
  getDocs, 
  setDoc, 
  where, 
  doc,
  limit 
} from 'firebase/firestore';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import VideoCall from './components/VideoCall';

// --- Types ---
interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
  type: 'text' | 'emoji' | 'sticker';
  roomId: string;
  isGhost?: boolean;
}

interface Room {
  id: string;
  name: string;
  isPrivate?: boolean;
  participants?: string[];
}

interface SystemUser {
  id: string;
  displayName: string;
  photoURL: string;
  isOnline: boolean;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [recipientId, setRecipientId] = useState<string | null>(null);
  const [ghostMode, setGhostMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Auth & Init ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Register/Update User in DB
        await setDoc(doc(db, 'users', u.uid), {
          displayName: u.displayName,
          photoURL: u.photoURL,
          isOnline: true,
          lastSeen: serverTimestamp()
        }, { merge: true });

        // Ensure Public Room exists
        await setDoc(doc(db, 'rooms', 'public'), {
          name: 'Public Square',
          isPrivate: false,
          createdAt: serverTimestamp()
        }, { merge: true });
      }
    });
    return unsub;
  }, []);

  // --- Listeners: Rooms & Users ---
  useEffect(() => {
    if (!user) return;

    // Listen for Rooms
    const qRooms = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubRooms = onSnapshot(qRooms, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Room));
      setRooms(fetched);
      if (!activeRoom) {
        const pub = fetched.find(r => r.id === 'public');
        if (pub) setActiveRoom(pub);
      }
    });

    // Listen for Online Users
    const qUsers = query(collection(db, 'users'), limit(50));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setSystemUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)));
    });

    return () => {
      unsubRooms();
      unsubUsers();
    };
  }, [user, activeRoom]);

  // --- Listeners: Messages ---
  useEffect(() => {
    if (!activeRoom || !user) return;

    const messagesRef = collection(db, 'rooms', activeRoom.id, 'messages');
    const qMsgs = query(messagesRef, orderBy('timestamp', 'asc'), limit(100));

    const unsubMsgs = onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (err) => {
      if (err.code === 'permission-denied') setMessages([]);
    });

    return unsubMsgs;
  }, [activeRoom, user]);

  // --- Scroll to Bottom ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Actions ---
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider).catch(console.error);
  };

  const createRoom = async () => {
    const name = prompt('Channel Name:');
    if (!name) return;
    await addDoc(collection(db, 'rooms'), {
      name,
      isPrivate: false,
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
  };

  const startPrivateChat = async (target: SystemUser) => {
    if (target.id === user.uid) return;
    const comboId = [user.uid, target.id].sort().join('_');
    await setDoc(doc(db, 'rooms', comboId), {
      name: `DM: ${target.displayName}`,
      isPrivate: true,
      participants: [user.uid, target.id],
      createdAt: serverTimestamp()
    }, { merge: true });
    setActiveRoom({ id: comboId, name: target.displayName, isPrivate: true });
  };

  const sendMessage = async (e?: React.FormEvent, type: 'text' | 'emoji' = 'text', overrideText?: string) => {
    e?.preventDefault();
    const text = overrideText || inputText;
    if (!text.trim() || !activeRoom) return;

    await addDoc(collection(db, 'rooms', activeRoom.id, 'messages'), {
      text,
      type,
      senderId: user.uid,
      senderName: user.displayName,
      timestamp: serverTimestamp(),
      isGhost: ghostMode
    });

    if (!overrideText) setInputText('');
    setShowEmojiPicker(false);
  };

  // --- Render Helpers ---
  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 selection:bg-cyan-500/30 overflow-hidden font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,#0a1a2a_0%,transparent_50%)] opacity-80" />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative bg-[#0C0D0F] border border-white/5 p-12 rounded-[3.5rem] w-full max-w-lg shadow-[0_0_100px_rgba(0,0,0,0.8)] text-center"
        >
          <div className="w-20 h-20 bg-cyan-500 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-2xl shadow-cyan-500/20">
            <Zap size={40} className="text-black" />
          </div>
          <h1 className="text-7xl font-black italic tracking-tighter mb-4 glow-text">RONZAI</h1>
          <p className="text-white/20 uppercase tracking-[0.4em] text-[10px] font-bold mb-12">Authorized Uplink Only</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-black font-black py-6 rounded-2xl hover:bg-cyan-400 transition-all active:scale-95 shadow-xl flex items-center justify-center space-x-3 text-sm tracking-widest"
          >
            <span>INITIALIZE CONNECTION</span>
            <ChevronRight size={18} />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#08090A] text-white flex overflow-hidden font-sans">
      {/* Sidebar - Always visible on desktop, toggle on mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.aside 
            initial={{ x: -100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -100, opacity: 0 }}
            className="w-84 bg-[#0C0D0F] border-r border-white/5 flex flex-col h-full z-40 relative shadow-2xl"
          >
            <div className="p-8 border-b border-white/5 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black italic tracking-tighter glow-text">RONZAI</h2>
                <div className="flex items-center space-x-1.5 mt-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-white/20 uppercase font-bold tracking-widest">Active</span>
                </div>
              </div>
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-2 hover:bg-white/5 rounded-xl sm:hidden"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
              {/* Channels */}
              <div>
                <div className="flex items-center justify-between px-4 mb-4">
                  <span className="text-[10px] text-white/20 font-bold tracking-widest uppercase">Nodes / Channels</span>
                  <button onClick={createRoom} className="p-1 text-cyan-400 hover:scale-110 transition-transform">
                    <PlusCircle size={20} />
                  </button>
                </div>
                <div className="space-y-1">
                  {rooms.filter(r => !r.isPrivate).map(room => (
                    <button 
                      key={room.id}
                      onClick={() => setActiveRoom(room)}
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all ${
                        activeRoom?.id === room.id ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-white/40 hover:bg-white/5'
                      }`}
                    >
                      <Hash size={18} className={activeRoom?.id === room.id ? 'text-cyan-400' : 'text-white/10'} />
                      <span className="text-sm font-bold truncate">{room.name}</span>
                      {activeRoom?.id === room.id && <Activity size={10} className="animate-pulse ml-auto" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direct Messages */}
              <div>
                <div className="px-4 mb-4">
                  <span className="text-[10px] text-white/20 font-bold tracking-widest uppercase">Established Links</span>
                </div>
                <div className="space-y-2">
                  {systemUsers.filter(u => u.id !== user.uid).map(u => (
                    <button 
                      key={u.id}
                      onClick={() => startPrivateChat(u)}
                      className={`w-full flex items-center space-x-3 px-3 py-2 rounded-2xl group transition-all ${
                        activeRoom?.name.includes(u.displayName) ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' : 'text-white/40 hover:bg-white/5'
                      }`}
                    >
                      <div className="relative">
                        <img src={u.photoURL} alt="" className="w-8 h-8 rounded-xl grayscale group-hover:grayscale-0 transition-all border border-white/10" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0C0D0F]" />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-bold truncate group-hover:text-white transition-colors">{u.displayName}</p>
                        <p className="text-[8px] uppercase text-white/10 tracking-widest">Authorized Agent</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Ghost Mode Toggle */}
            <div className="p-6">
              <button 
                onClick={() => setGhostMode(!ghostMode)}
                className={`w-full p-4 rounded-2xl border transition-all flex flex-col space-y-2 ${
                  ghostMode ? 'bg-red-500/10 border-red-500/30 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'bg-white/[0.02] border-white/5 text-white/20 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center space-x-2">
                    <Ghost size={16} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Ghost Protocol</span>
                  </div>
                  <div className={`w-8 h-4 rounded-full relative transition-all ${ghostMode ? 'bg-red-500' : 'bg-white/10'}`}>
                    <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${ghostMode ? 'right-0.5' : 'left-0.5'}`} />
                  </div>
                </div>
                <p className="text-[8px] text-left opacity-60 leading-tight">Messages vanish on refresh when protocol is engaged.</p>
              </button>
            </div>

            {/* Profile */}
            <div className="p-6 bg-[#0A0B0D] border-t border-white/5">
              <div className="flex items-center space-x-4">
                <img src={user.photoURL} className="w-11 h-11 rounded-2xl border border-white/10" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate tracking-tight">{user.displayName}</p>
                  <p className="text-[9px] text-white/20 uppercase font-mono">Sync Active</p>
                </div>
                <button onClick={() => signOut(auth)} className="p-2 text-white/20 hover:text-red-500 transition-colors">
                  <LogOut size={18} />
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Interface */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {!isSidebarOpen && (
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="absolute top-8 left-8 z-30 p-4 bg-white/5 border border-white/10 rounded-2xl text-white/50 hover:text-white transition-all shadow-2xl backdrop-blur-md"
          >
            <Layers size={24} />
          </button>
        )}

        {activeRoom ? (
          <>
            {/* Chat Header */}
            <header className="p-8 pb-4 flex items-center justify-between relative z-10 backdrop-blur-3xl bg-[#08090A]/50">
              <div className="flex items-center space-x-5">
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-2xl font-black italic border border-white/5">
                  {activeRoom.name[0]}
                </div>
                <div>
                  <h3 className="text-3xl font-black italic tracking-tighter uppercase glow-text">/{activeRoom.name.replace('DM: ', '')}</h3>
                  <div className="flex items-center space-x-2 mt-0.5">
                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full mt-0.5" />
                    <span className="text-[9px] text-white/20 uppercase tracking-[0.3em] font-bold">Secure Frequency</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button 
                  onClick={() => { setRecipientId(user.uid); setIsCalling(true); }}
                  className="p-4 bg-white/5 border border-white/5 rounded-2xl text-white/30 hover:bg-cyan-500 hover:text-black transition-all shadow-lg active:scale-90"
                >
                  <Video size={20} />
                </button>
                <button className="p-4 bg-white/5 border border-white/5 rounded-2xl text-white/30 hover:text-white transition-all shadow-lg">
                  <MoreVertical size={20} />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-10 py-10 space-y-8 scrollbar-hide relative">
              <div className="absolute inset-0 pointer-events-none opacity-[0.03] overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/pinstriped-dark.png')]" />
              </div>
              
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <motion.div 
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex flex-col ${msg.senderId === user.uid ? 'items-end' : 'items-start'}`}
                  >
                    <div className={`flex items-center space-x-2 mb-2 px-1 ${msg.senderId === user.uid ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">{msg.senderName}</span>
                      <span className="text-[9px] text-white/10 font-mono">
                        {msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                      </span>
                    </div>
                    <div 
                      className={`max-w-[75%] px-6 py-4 rounded-[1.5rem] relative group border shadow-2xl transition-all hover:scale-[1.01] ${
                        msg.senderId === user.uid 
                          ? 'bg-white text-black font-black border-white rounded-tr-none' 
                          : 'bg-[#121315] border-white/10 text-white/90 rounded-tl-none backdrop-blur-md'
                      }`}
                    >
                      <p className="text-[14px] leading-relaxed tracking-tight">{msg.text}</p>
                      {msg.isGhost && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_8px_red] animate-pulse" title="Ghost Message" />
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="p-10 pt-0 relative z-20">
              <div className="max-w-4xl mx-auto relative">
                <AnimatePresence>
                  {showEmojiPicker && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute bottom-full mb-6 left-0 z-50 border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                    >
                      <EmojiPicker 
                        theme={'dark' as any}
                        onEmojiClick={(data: EmojiClickData) => sendMessage(undefined, 'emoji', data.emoji)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <form 
                  onSubmit={sendMessage}
                  className="bg-[#121316] border border-white/5 rounded-[2rem] p-3 flex items-center space-x-3 shadow-[0_30px_60px_rgba(0,0,0,0.5)] focus-within:border-cyan-500/30 transition-all backdrop-blur-3xl"
                >
                  <button 
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className={`p-4 rounded-2xl transition-all ${showEmojiPicker ? 'bg-cyan-500 text-black' : 'text-white/20 hover:text-white hover:bg-white/5'}`}
                  >
                    <Smile size={24} />
                  </button>
                  <input
                    type="text"
                    value={inputText}
                    placeholder="Transmit payload..."
                    onChange={(e) => setInputText(e.target.value)}
                    onFocus={() => setShowEmojiPicker(false)}
                    className="flex-1 bg-transparent border-none outline-none text-white px-4 font-bold placeholder:text-white/5 text-base"
                  />
                  <button 
                    type="submit"
                    className="p-4 bg-cyan-500 text-black rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:scale-105 active:scale-95 transition-all"
                  >
                    <Send size={24} />
                  </button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-12 text-center">
            <div className="space-y-8 max-w-sm">
              <div className="w-24 h-24 bg-white/5 rounded-[2rem] border border-white/5 mx-auto flex items-center justify-center">
                <ShieldCheck size={48} className="text-white/10" />
              </div>
              <div className="space-y-2">
                <h2 className="text-4xl font-black italic tracking-tighter opacity-40 uppercase">No Uplink Established</h2>
                <p className="text-xs text-white/10 uppercase tracking-[0.3em] font-bold">Select a node from the terminal explorer</p>
              </div>
              <button 
                onClick={() => {
                   const pub = rooms.find(r => r.id === 'public');
                   if (pub) setActiveRoom(pub);
                }}
                className="px-10 py-4 bg-white/5 border border-white/10 rounded-2xl text-cyan-400 font-black tracking-widest text-[10px] hover:bg-cyan-500 hover:text-black transition-all"
              >
                AUTOCONNECT TO PUBLIC [0x00]
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Video Call Overlay */}
      <AnimatePresence>
        {isCalling && (
          <VideoCall 
            callerId={user.uid} 
            recipientId={recipientId!} 
            onClose={() => setIsCalling(false)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
