import React, { useState, useEffect, useRef, useMemo } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider, signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, 
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
  ChevronRight,
  Monitor,
  Command,
  Circle,
  Settings
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
  limit,
  Timestamp
} from 'firebase/firestore';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';

// --- Types ---
interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  timestamp: any;
  type: 'text' | 'emoji' | 'sticker';
  isGhost?: boolean;
  sending?: boolean; // For optimistic UI
}

interface Room {
  id: string;
  name: string;
  isPrivate?: boolean;
  participants?: string[];
  createdBy?: string;
}

interface SystemUser {
  id: string;
  displayName: string;
  photoURL: string;
  isOnline: boolean;
  lastSeen?: any;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [ghostMode, setGhostMode] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // --- Auth & Init ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        await getRedirectResult(auth);
      } catch (err) {
        console.error("Redirect Result Error:", err);
      }

      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        setIsInitializing(false);
        if (u) {
          // Register User
          await setDoc(doc(db, 'users', u.uid), {
            displayName: u.displayName || 'Unknown Agent',
            photoURL: u.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}`,
            isOnline: true,
            lastSeen: serverTimestamp()
          }, { merge: true });

          // Force Public Room
          try {
            await setDoc(doc(db, 'rooms', 'public'), {
              name: 'Public Square',
              isPrivate: false,
              createdAt: serverTimestamp(),
              createdBy: 'system'
            }, { merge: true });
          } catch (e) {
            console.warn("Public Node check skipped.");
          }
        }
      });
    };
    initAuth();
  }, []);

  // --- Data Fetching ---
  useEffect(() => {
    if (!user) return;

    // Rooms Listener
    const qRooms = query(collection(db, 'rooms'), orderBy('createdAt', 'desc'));
    const unsubRooms = onSnapshot(qRooms, (snap) => {
      const fetched = snap.docs.map(d => ({ id: d.id, ...d.data() } as Room));
      setRooms(fetched);
      if (!activeRoom) {
        const pub = fetched.find(r => r.id === 'public');
        if (pub) setActiveRoom(pub);
      }
    });

    // Users Listener
    const qUsers = query(collection(db, 'users'), limit(50));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setSystemUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser)));
    });

    return () => {
      unsubRooms();
      unsubUsers();
    };
  }, [user, activeRoom]);

  // --- Messages Listener ---
  useEffect(() => {
    if (!activeRoom || !user) return;

    const messagesRef = collection(db, 'rooms', activeRoom.id, 'messages');
    const qMsgs = query(messagesRef, orderBy('timestamp', 'asc'), limit(150));

    const unsubMsgs = onSnapshot(qMsgs, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
    }, (err) => {
      console.error("Messages Error:", err);
      if (err.code === 'permission-denied') setMessages([]);
    });

    return unsubMsgs;
  }, [activeRoom?.id, user?.uid]);

  // --- Auto-scroll ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- Actions ---
  const handleLogin = async (method: 'popup' | 'redirect' = 'popup') => {
    setLoginError(null);
    const provider = new GoogleAuthProvider();
    try {
      if (method === 'popup') {
        await signInWithPopup(auth, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        handleLogin('redirect');
      } else {
        setLoginError(error.message);
      }
    }
  };

  const createRoom = async () => {
    const name = window.prompt('Access Point Designation:');
    if (!name) return;
    try {
      await addDoc(collection(db, 'rooms'), {
        name,
        isPrivate: false,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      });
    } catch (e: any) {
      alert(`Terminal Error: ${e.message}`);
    }
  };

  const sendMessage = async (e?: React.FormEvent, type: 'text' | 'emoji' = 'text', overrideText?: string) => {
    e?.preventDefault();
    const text = overrideText || inputText;
    if (!text.trim() || !activeRoom || !user) return;

    const msgText = text.trim();
    if (!overrideText) setInputText('');
    setShowEmojiPicker(false);

    // Optimistic UI Update
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      text: msgText,
      senderId: user.uid,
      senderName: user.displayName || 'Agent',
      timestamp: Timestamp.now(),
      type,
      isGhost: ghostMode,
      sending: true
    };
    setMessages(prev => [...prev, optimisticMsg]);

    const path = `rooms/${activeRoom.id}/messages`;
    try {
      await addDoc(collection(db, path), {
        text: msgText,
        type,
        senderId: user.uid,
        senderName: user.displayName || 'Agent',
        timestamp: serverTimestamp(),
        isGhost: ghostMode
      });
    } catch (error: any) {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  if (isInitializing) return null;

  if (!user) {
    return (
      <div className="h-screen bg-[#050505] flex items-center justify-center p-6 relative overflow-hidden font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,#001a2a_0%,transparent_50%)]" />
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-md text-center space-y-12"
        >
          <div className="space-y-4">
            <h1 className="text-8xl font-black italic tracking-tighter glow-text leading-none select-none">RONZAI</h1>
            <p className="text-[10px] text-cyan-500 font-black uppercase tracking-[0.5em]">Authorized Uplink Required</p>
          </div>

          <div className="space-y-4 pt-8">
            {loginError && <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase">{loginError}</div>}
            <button 
              onClick={() => handleLogin('popup')}
              className="w-full bg-white text-black font-black py-6 rounded-3xl hover:bg-cyan-400 transition-all flex items-center justify-center space-x-3"
            >
              <span className="text-xs tracking-widest">INITIALIZE SESSION</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#020304] text-white flex overflow-hidden font-sans">
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.aside 
        initial={{ x: -300 }} animate={{ x: 0 }}
        className={`w-[320px] bg-[#08090B] border-r border-white/5 flex flex-col h-full z-50 fixed lg:relative shadow-2xl ${!isSidebarOpen && 'hidden lg:flex'}`}
      >
        <div className="p-8 pb-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-8 text-cyan-500">
             <h2 className="text-2xl font-black italic tracking-tighter uppercase glow-text">RONZAI</h2>
             <Monitor size={20} />
          </div>
          <div className="p-4 bg-white/[0.03] border border-white/5 rounded-2xl flex items-center space-x-4">
            <img src={user.photoURL} className="w-10 h-10 rounded-xl border border-white/10" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{user.displayName}</p>
              <p className="text-[8px] text-emerald-500 uppercase font-black tracking-widest">Linked</p>
            </div>
            <button onClick={() => signOut(auth)} className="text-white/10 hover:text-red-500 transition-colors"><LogOut size={16} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2 text-white/20">
              <span className="text-[9px] font-black uppercase tracking-[0.3em]">Channels</span>
              <button onClick={createRoom} className="hover:text-cyan-400 transition-colors"><PlusCircle size={18} /></button>
            </div>
            <div className="space-y-1">
              {rooms.filter(r => !r.isPrivate).map(room => (
                <button 
                  key={room.id}
                  onClick={() => { setActiveRoom(room); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-2xl transition-all border ${activeRoom?.id === room.id ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' : 'border-transparent text-white/30 hover:bg-white/[0.03]'}`}
                >
                  <Hash size={16} />
                  <span className="text-sm font-bold truncate">{room.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="px-2 text-white/20">
              <span className="text-[9px] font-black uppercase tracking-[0.3em]">Direct Links</span>
            </div>
            <div className="space-y-2">
              {systemUsers.filter(u => u.id !== user.uid).map(u => (
                <button 
                  key={u.id}
                  onClick={() => {
                    const targetId = [user.uid, u.id].sort().join('_');
                    setActiveRoom({ id: targetId, name: u.displayName, isPrivate: true });
                    setIsSidebarOpen(false);
                  }}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-2xl hover:bg-white/[0.03] transition-all group"
                >
                  <div className="relative">
                    <img src={u.photoURL} className="w-8 h-8 rounded-xl grayscale group-hover:grayscale-0 transition-all" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-[#08090B]" />
                  </div>
                  <span className="text-[13px] font-bold truncate text-white/40 group-hover:text-white transition-colors">{u.displayName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6">
          <button 
            onClick={() => setGhostMode(!ghostMode)}
            className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl border transition-all ${ghostMode ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-white/[0.02] border-white/5 text-white/20'}`}
          >
            <Ghost size={16} />
            <div className="flex-1 text-left">
              <p className="text-[10px] font-black uppercase tracking-widest">Ghost Protocol</p>
              <p className="text-[7px] uppercase font-mono opacity-50">{ghostMode ? 'ENABLED' : 'DISABLED'}</p>
            </div>
            <div className={`w-2 h-2 rounded-full ${ghostMode ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-white/10'}`} />
          </button>
        </div>
      </motion.aside>

      <main className="flex-1 relative flex flex-col min-w-0">
        {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="fixed top-6 left-6 z-40 p-4 bg-cyan-600 rounded-2xl lg:hidden shadow-2xl"><Command size={20}/></button>}

        {activeRoom ? (
          <>
            <header className="px-10 py-8 flex items-center justify-between border-b border-white/[0.03] backdrop-blur-3xl bg-[#020304]/60">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-3xl font-black italic border border-white/5">{activeRoom.name[0]}</div>
                <div>
                  <h3 className="text-4xl font-black italic tracking-tighter uppercase glow-text">/{activeRoom.name.replace('DM: ', '')}</h3>
                  <p className="text-[9px] text-white/15 uppercase tracking-[0.4em] font-bold mt-1">Uplink Confirmed: Secure Channel</p>
                </div>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-10 py-12 scrollbar-hide relative bg-[#020304]">
              <div className="max-w-5xl mx-auto space-y-8">
                {messages.map((msg, i) => {
                  const isMe = msg.senderId === user.uid;
                  const showMeta = i === 0 || messages[i-1].senderId !== msg.senderId;
                  return (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      {showMeta && (
                        <div className={`flex items-center space-x-3 mb-2 px-2 text-[10px] font-bold uppercase tracking-widest ${isMe ? 'text-cyan-500/50' : 'text-white/20'}`}>
                           <span>{msg.senderName}</span>
                           <span className="text-white/5 font-mono">{msg.timestamp?.toDate ? new Date(msg.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        </div>
                      )}
                      <div className={`px-8 py-5 rounded-[2rem] border transition-all ${isMe ? 'bg-white text-black font-medium border-white rounded-tr-none' : 'bg-[#0E0F12] text-white/80 border-white/5 rounded-tl-none'} ${msg.sending ? 'opacity-50' : ''}`}>
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="px-10 pb-10">
              <div className="max-w-5xl mx-auto relative">
                {showEmojiPicker && (
                  <div className="absolute bottom-full mb-8 left-0 z-50 border border-white/10 rounded-[2.5rem] overflow-hidden">
                    <EmojiPicker theme={'dark' as any} onEmojiClick={(data) => sendMessage(undefined, 'emoji', data.emoji)} />
                  </div>
                )}
                <form onSubmit={sendMessage} className="bg-[#0E0F12] border border-white/10 rounded-[2.5rem] p-4 flex items-center space-x-3 shadow-2xl">
                  <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} className={`p-4 rounded-2xl transition-all ${showEmojiPicker ? 'bg-cyan-500 text-black' : 'text-white/20 hover:text-white'}`}><Smile size={24} /></button>
                  <input type="text" value={inputText} placeholder="Type message..." onChange={(e) => setInputText(e.target.value)} onFocus={() => setShowEmojiPicker(false)} className="flex-1 bg-transparent border-none outline-none text-white px-4 font-bold text-lg placeholder:text-white/5 py-4" />
                  <button type="submit" disabled={!inputText.trim()} className={`p-6 rounded-2xl transition-all ${inputText.trim() ? 'bg-cyan-500 text-black' : 'bg-white/5 text-white/10'}`}><Send size={24} /></button>
                </form>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-12">
            <h2 className="text-6xl font-black italic tracking-tighter uppercase opacity-30">Select Node</h2>
            <button onClick={async () => {
              const pub = rooms.find(r => r.id === 'public');
              if (pub) setActiveRoom(pub);
              else {
                await setDoc(doc(db, 'rooms', 'public'), { name: 'Public Square', isPrivate: false, createdAt: serverTimestamp(), createdBy: 'system' }, { merge: true });
                setActiveRoom({ id: 'public', name: 'Public Square' });
              }
            }} className="bg-white text-black px-12 py-6 rounded-3xl font-black tracking-widest text-xs shadow-2xl">AUTOCONNECT_TO_PUBLIC</button>
          </div>
        )}
      </main>
    </div>
  );
}
