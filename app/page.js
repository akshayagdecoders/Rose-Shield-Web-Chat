'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [targetIdInput, setTargetIdInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [recentChats, setRecentChats] = useState([]);
  const [chattingWith, setChattingWith] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [otherUserOnline, setOtherUserOnline] = useState(null); // null = unknown, true = online, false = offline
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [unreadScrollCount, setUnreadScrollCount] = useState(0);
  const [prevMessagesCount, setPrevMessagesCount] = useState(0);
  // Settings & Profile
  const [showSettings, setShowSettings] = useState(false);
  const [settingsView, setSettingsView] = useState('main'); // 'main' | 'bio' | 'password' | 'delete'
  const [editDescription, setEditDescription] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState({ type: '', text: '' });
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [editName, setEditName] = useState('');
  // Calls
  const [sidebarTab, setSidebarTab] = useState('chats');
  const [callHistory, setCallHistory] = useState([]);
  const [activeCall, setActiveCall] = useState(null);   // { id, type, direction, partner }
  const [incomingCall, setIncomingCall] = useState(null); // { id, type, caller_name, caller_avatar }
  const [callStatus, setCallStatus] = useState('idle'); // idle | ringing | active
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [learnedWords, setLearnedWords] = useState([]);
  const [isScanning, setIsScanning] = useState(false); // Global AI Scanning state

  const messagesEndRef = useRef(null);
  const messagesAreaRef = useRef(null);
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const callIdRef = useRef(null);
  const isCallerRef = useRef(false);
  const callStartTimeRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const callPollRef = useRef(null);

  useEffect(() => {
    setIsInitializing(false); // No longer need to fetch /api/db-init every time
    const savedUser = localStorage.getItem('chat_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setUser(parsed);
      // Re-sync from server sparingly or only on demand
      syncUserProfile(parsed.id);
    }
  }, []);

  const syncUserProfile = async (userId) => {
    try {
      // Only fetch profile if user is logged in
      if (!userId) return;
      const res = await fetch(`/api/users/profile?userId=${userId}`);
      if (res.ok) {
        const freshUser = await res.json();
        setUser(freshUser);
        localStorage.setItem('chat_user', JSON.stringify(freshUser));
      }
    } catch (err) {}
  };

  useEffect(() => {
    if (user) {
      const sync = async () => {
        if (document.hidden) return;
        try {
          const url = `/api/sync?userId=${user.id}${chattingWith ? `&chattingWithId=${chattingWith.id}` : ''}`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            setRecentChats(data.chats || []);
            if (chattingWith && data.messages) {
              setMessages(data.messages);
            }
            if (chattingWith && data.presence) {
               setOtherUserOnline(data.presence.online);
            } else if (!chattingWith) {
               setOtherUserOnline(null);
            }
            if (data.incomingCall && callStatus === 'idle') {
              setIncomingCall(data.incomingCall);
            } else if (!data.incomingCall) {
              setIncomingCall(null);
            }
          }
        } catch (err) {
          console.error('Sync error:', err);
        }
      };

      // Initial sync
      sync();
      
      // Heartbeat (Presence POST) - runs every 90s
      const pingId = setInterval(() => {
        if (document.hidden) return;
        fetch('/api/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {});
      }, 90000);

      // Main Sync - runs every 30s
      const syncId = setInterval(sync, 30000);

      return () => {
        clearInterval(pingId);
        clearInterval(syncId);
      };
    }
  }, [user, chattingWith, callStatus]);

  // ── Call history ──
  useEffect(() => {
    if (!user || sidebarTab !== 'calls') return;
    fetch(`/api/calls/history?userId=${user.id}`)
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setCallHistory(d); })
      .catch(() => {});
  }, [user, sidebarTab]);

  useEffect(() => {
    if (!isScrolledUp) {
      scrollToBottom();
      setUnreadScrollCount(0);
    } else if (messages.length > prevMessagesCount) {
      setUnreadScrollCount(prev => prev + (messages.length - prevMessagesCount));
    }
    setPrevMessagesCount(messages.length);
  }, [messages]);

  // When switching chats, reset scroll and counts
  useEffect(() => {
    setIsScrolledUp(false);
    setUnreadScrollCount(0);
    setPrevMessagesCount(0);
  }, [chattingWith]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setIsScrolledUp(false);
    setUnreadScrollCount(0);
  };

  const handleScroll = () => {
    if (!messagesAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesAreaRef.current;
    // If we are more than 50px from the bottom, we are "scrolled up"
    const isUp = scrollHeight - scrollTop - clientHeight > 50;
    setIsScrolledUp(isUp);
    if (!isUp) {
      setUnreadScrollCount(0); // clear badge when we hit bottom
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!emailInput || !passwordInput || (isSignUp && !nameInput)) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          mode: isSignUp ? 'signup' : 'login',
          email: emailInput, 
          password: passwordInput,
          name: nameInput
        }),
      });
      const data = await resp.json();
      if (resp.ok) {
        setUser(data);
        localStorage.setItem('chat_user', JSON.stringify(data));
      } else {
        alert(data.error || 'Authentication failed');
      }
    } catch (err) {
      alert('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchUser = async (e) => {
    e.preventDefault();
    if (!targetIdInput) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/users/search?userId=${targetIdInput}`);
      if (resp.ok) {
        const data = await resp.json();
        setChattingWith(data);
        setMessages([]);
      } else {
        alert('User not found');
      }
    } catch (err) {
      alert('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (!user || !chattingWith) return;
    try {
      const resp = await fetch(`/api/messages?user1=${user.id}&user2=${chattingWith.id}`);
      const data = await resp.json();
      setMessages(data);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };
  
  const fetchRecentChats = async () => {
    if (!user) return;
    try {
      const resp = await fetch(`/api/users/chats?userId=${user.id}`);
      if (resp.ok) {
        const data = await resp.json();
        setRecentChats(data);
      }
    } catch (err) {
      console.error('Fetch chats error:', err);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !chattingWith) return;

    const content = newMessage;
    setNewMessage('');
    const formData = new FormData();
    formData.append('senderId', user.id);
    formData.append('receiverId', chattingWith.id);
    formData.append('type', 'text');
    formData.append('content', content);
    try {
      await fetch('/api/messages', { method: 'POST', body: formData });
      fetchMessages();
    } catch (err) { alert('Send failed'); }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !chattingWith) return;

    // Convert to Base64 for easier processing on Vercel
    const reader = new FileReader();
    reader.onload = async () => {
      const base64String = reader.result;
      try {
        setIsScanning(true);
        const res = await fetch('/api/messages', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            senderId: user.id,
            receiverId: chattingWith.id,
            type: 'image',
            file: base64String // Send as Base64 string
          }) 
        });
        setIsScanning(false);
        if (res.ok) {
           fetchMessages();
        } else {
           const d = await res.json();
           alert(d.error || 'Upload failed');
        }
      } catch (err) { 
        setIsScanning(false);
        alert('Upload failed'); 
      }
    };
    reader.onerror = () => alert('Failed to read image file');
    reader.readAsDataURL(file);
  };


  const handleReportMessage = async (msg) => {
    if (!user.is_admin) return;
    if (!confirm('Train AI on this content and block it permanently?')) return;
    
    try {
      const resp = await fetch('/api/admin/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          messageId: msg.id,
          content: msg.original_content || msg.content
        })
      });
      
      if (resp.ok) {
        alert('Shield Hardened: Pattern learned and message blocked.');
        fetchMessages(); // refresh
      } else {
        const d = await resp.json();
        alert(d.error || 'Report failed');
      }
    } catch (err) {
      alert('Report failed');
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSettingsLoading(true);
    setSettingsMsg({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('name', user.name); // preserve current name
      formData.append('description', user.description || '');
      formData.append('avatar', file);
      const resp = await fetch('/api/users/profile', { method: 'PUT', body: formData });
      if (resp.ok) {
        const updated = await resp.json();
        const newUser = { ...user, ...updated };
        setUser(newUser);
        localStorage.setItem('chat_user', JSON.stringify(newUser));
        setSettingsMsg({ type: 'success', text: 'Profile photo updated!' });
      } else {
        const d = await resp.json();
        setSettingsMsg({ type: 'error', text: d.error || 'Upload failed' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Upload failed' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveBio = async () => {
    setSettingsLoading(true);
    setSettingsMsg({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('name', user.name); // preserve current name
      formData.append('description', editDescription);
      const resp = await fetch('/api/users/profile', { method: 'PUT', body: formData });
      if (resp.ok) {
        const updated = await resp.json();
        const newUser = { ...user, ...updated };
        setUser(newUser);
        localStorage.setItem('chat_user', JSON.stringify(newUser));
        setSettingsMsg({ type: 'success', text: 'Bio saved!' });
        setTimeout(() => setSettingsView('main'), 800);
      } else {
        const d = await resp.json();
        setSettingsMsg({ type: 'error', text: d.error || 'Save failed' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Save failed' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveName = async () => {
    if (!editName.trim()) {
      setSettingsMsg({ type: 'error', text: 'Name cannot be empty' });
      return;
    }
    setSettingsLoading(true);
    setSettingsMsg({ type: '', text: '' });
    try {
      const formData = new FormData();
      formData.append('userId', user.id);
      formData.append('name', editName.trim());
      formData.append('description', user.description || '');
      const resp = await fetch('/api/users/profile', { method: 'PUT', body: formData });
      if (resp.ok) {
        const updated = await resp.json();
        const newUser = { ...user, ...updated };
        setUser(newUser);
        localStorage.setItem('chat_user', JSON.stringify(newUser));
        setSettingsMsg({ type: 'success', text: 'Name updated!' });
        setTimeout(() => setSettingsView('main'), 800);
      } else {
        const d = await resp.json();
        setSettingsMsg({ type: 'error', text: d.error || 'Save failed' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Save failed' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== newPassword2) {
      setSettingsMsg({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    setSettingsLoading(true);
    setSettingsMsg({ type: '', text: '' });
    try {
      const resp = await fetch('/api/users/security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, oldPassword, newPassword }),
      });
      const d = await resp.json();
      if (resp.ok) {
        setSettingsMsg({ type: 'success', text: 'Password changed successfully!' });
        setOldPassword(''); setNewPassword(''); setNewPassword2('');
        setTimeout(() => setSettingsView('main'), 1000);
      } else {
        setSettingsMsg({ type: 'error', text: d.error || 'Failed' });
      }
    } catch (err) {
      setSettingsMsg({ type: 'error', text: 'Request failed' });
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('This will permanently delete your account and all your messages. Are you sure?')) return;
    try {
      const resp = await fetch(`/api/users/profile?userId=${user.id}`, { method: 'DELETE' });
      if (resp.ok) {
        localStorage.removeItem('chat_user');
        setUser(null);
      } else {
        alert('Delete failed. Please try again.');
      }
    } catch (err) {
      alert('Delete failed.');
    }
  };

  const fetchLearnedWords = async () => {
    try {
      const res = await fetch(`/api/admin/moderation?userId=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setLearnedWords(data);
      }
    } catch (err) {}
  };

  const handleRemoveLearnedWord = async (word) => {
    if (!confirm(`Remove "${word}" from blocklist?`)) return;
    try {
      const res = await fetch('/api/admin/moderation', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, word })
      });
      if (res.ok) {
        fetchLearnedWords();
      }
    } catch (err) {}
  };

  // ══════════════════════════════════════════
  // WebRTC Call Handlers
  // ══════════════════════════════════════════
  const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

  const cleanupCall = () => {
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    if (callPollRef.current) { clearInterval(callPollRef.current); callPollRef.current = null; }
    setCallStatus('idle'); setActiveCall(null); setIsMuted(false); setIsCameraOff(false); setIsScreenSharing(false); setCallDuration(0);
  };

  const startDurationTimer = () => {
    callStartTimeRef.current = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
    }, 1000);
  };

  const formatDuration = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const startCall = async (type) => {
    if (!chattingWith) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia(type === 'video' ? { video: true, audio: true } : { audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };

      const iceCandidates = [];
      pc.onicecandidate = (e) => { if (e.candidate) iceCandidates.push(e.candidate); };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: user.id, receiverId: chattingWith.id, type, offer: JSON.stringify(offer) })
      });
      const { id: callId } = await res.json();
      callIdRef.current = callId;
      isCallerRef.current = true;

      setActiveCall({ id: callId, type, direction: 'outgoing', partner: chattingWith });
      setCallStatus('ringing');

      // Poll for answer
      callPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/calls?callId=${callId}`);
          const callData = await pollRes.json();

          if (callData.status === 'rejected' || callData.status === 'ended' || callData.status === 'missed') {
            cleanupCall(); return;
          }

          if (callData.answer && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(JSON.parse(callData.answer));
            setCallStatus('active');
            startDurationTimer();
          }

          // Add receiver ICE candidates
          if (callData.ice_receiver) {
            const candidates = JSON.parse(callData.ice_receiver);
            candidates.forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));
          }

          // Push our ICE candidates
          if (iceCandidates.length > 0) {
            await fetch(`/api/calls/${callId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ice_caller: JSON.stringify(iceCandidates) })
            });
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      alert('Could not access microphone/camera: ' + err.message);
      cleanupCall();
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    const callData = incomingCall;
    setIncomingCall(null);
    try {
      const type = callData.type;
      const stream = await navigator.mediaDevices.getUserMedia(type === 'video' ? { video: true, audio: true } : { audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      pc.ontrack = (e) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = e.streams[0]; };

      const iceCandidates = [];
      pc.onicecandidate = (e) => { if (e.candidate) iceCandidates.push(e.candidate); };

      await pc.setRemoteDescription(JSON.parse(callData.offer));
      
      // Add caller's ICE candidates if available
      if (callData.ice_caller) JSON.parse(callData.ice_caller).forEach(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      callIdRef.current = callData.id;
      isCallerRef.current = false;

      await fetch(`/api/calls/${callData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', answer: JSON.stringify(answer) })
      });

      setActiveCall({ id: callData.id, type, direction: 'incoming', partner: { username: callData.caller_name, avatar_url: callData.caller_avatar } });
      setCallStatus('active');
      startDurationTimer();

      // Push receiver ICE candidates
      callPollRef.current = setInterval(async () => {
        try {
          if (iceCandidates.length > 0) {
            await fetch(`/api/calls/${callData.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ice_receiver: JSON.stringify(iceCandidates) })
            });
          }
          // Check if caller ended
          const pollRes = await fetch(`/api/calls?callId=${callData.id}`);
          const latest = await pollRes.json();
          if (latest.status === 'ended' || latest.status === 'missed') cleanupCall();
        } catch { /* ignore */ }
      }, 2000);
    } catch (err) {
      alert('Could not access microphone/camera: ' + err.message);
      await fetch(`/api/calls/${callData.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) });
      cleanupCall();
    }
  };

  const rejectCall = async () => {
    if (!incomingCall) return;
    await fetch(`/api/calls/${incomingCall.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected' }) }).catch(() => {});
    setIncomingCall(null);
  };

  const endCall = async () => {
    const id = callIdRef.current;
    const duration = callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0;
    if (id) {
      await fetch(`/api/calls/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'ended', duration_seconds: duration }) }).catch(() => {});
    }
    cleanupCall();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    setIsMuted(m => !m);
  };

  const toggleCamera = () => {
    if (!localStreamRef.current) return;
    localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    setIsCameraOff(c => !c);
  };

  const startScreenShare = async () => {
    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (isScreenSharing) {
      // Stop screen share, revert to camera
      if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) { const sender = pc.getSenders().find(s => s.track?.kind === 'video'); if (sender) sender.replaceTrack(camTrack); }
      setIsScreenSharing(false);
    } else {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screenStream;
        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
        screenTrack.onended = () => { startScreenShare(); }; // revert when user stops via browser
        setIsScreenSharing(true);
      } catch (err) { /* user cancelled */ }
    }
  };

  if (isInitializing) {
    return (
      <div className="auth-container">
        <div style={{color: 'var(--primary)', fontWeight: '600', fontSize: '1.2rem'}}>
          Connecting to RoseShield...
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div style={{textAlign: 'center', marginBottom: '8px'}}>
            <h1 style={{color: 'var(--primary)', fontSize: '1.75rem', marginBottom: '8px'}}>RoseShield</h1>
            <p className="text-muted">Secure Encrypted Messaging</p>
          </div>
          <form onSubmit={handleAuth} style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
            {isSignUp && (
              <div className="auth-input-group">
                <label className="text-muted font-bold" style={{fontSize: '0.8rem'}}>DISPLAY NAME</label>
                <input type="text" className="input-field" placeholder="John Doe" value={nameInput} onChange={(e) => setNameInput(e.target.value)} required />
              </div>
            )}
            <div className="auth-input-group">
              <label className="text-muted font-bold" style={{fontSize: '0.8rem'}}>EMAIL ADDRESS</label>
              <input type="email" className="input-field" placeholder="john@example.com" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} required />
            </div>
            <div className="auth-input-group">
              <label className="text-muted font-bold" style={{fontSize: '0.8rem'}}>PASSWORD</label>
              <input type="password" className="input-field" placeholder="••••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required />
            </div>
            <button disabled={loading} className="btn-primary" style={{marginTop: '8px'}}>
              {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Log In')}
            </button>
            <p className="text-muted" style={{textAlign: 'center', marginTop: '8px'}}>
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <span onClick={() => setIsSignUp(!isSignUp)} style={{color: 'var(--primary)', cursor: 'pointer', fontWeight: 'bold'}}>
                {isSignUp ? 'Log In' : 'Sign Up'}
              </span>
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="app-wrapper">
      {/* Sidebar - Hidden on mobile if chatting */}
      <div className={`sidebar ${chattingWith ? 'hidden-mobile' : ''}`}>
        
        {/* User Profile Header */}
        <div className="panel-header">
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            {/* Clickable Avatar opens Settings */}
            <div onClick={() => { setShowSettings(true); setSettingsView('main'); setSettingsMsg({ type:'', text:'' }); setEditDescription(user.description || ''); }} style={{cursor:'pointer'}}>
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.name} style={{width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover'}} />
              ) : (
                <div className="avatar" style={{width:'36px',height:'36px',fontSize:'1rem',marginRight:'0'}}>
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div style={{display:'flex',flexDirection:'column'}}>
              <span className="text-main font-bold truncate" style={{maxWidth:'150px'}}>{user.name}</span>
              <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                <span className="text-muted font-mono">ID: {user.id}</span>
                <button className="btn-icon" onClick={() => navigator.clipboard.writeText(user.id)} title="Copy ID">
                  <svg style={{width:'12px',height:'12px',color:'var(--primary)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div style={{display:'flex',gap:'4px'}}>
            <button className="btn-icon" title="Settings" onClick={() => { setShowSettings(true); setSettingsView('main'); setSettingsMsg({ type:'', text:'' }); setEditDescription(user.description || ''); }}>
              <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button className="btn-icon" title="Log Out" onClick={() => { localStorage.removeItem('chat_user'); setUser(null); }}>
              <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            </button>
          </div>
        </div>

        {/* Settings Slide Panel */}
        {showSettings && (
          <div className="slide-panel">
            <div className="slide-panel-header">
              <button className="btn-icon" onClick={() => { if (settingsView === 'main') setShowSettings(false); else setSettingsView('main'); setSettingsMsg({ type:'', text:'' }); }}>
                <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
              </button>
              <span className="text-main font-bold">{settingsView === 'main' ? 'Settings' : settingsView === 'bio' ? 'Edit Bio' : settingsView === 'name' ? 'Change Name' : settingsView === 'password' ? 'Change Password' : settingsView === 'moderation' ? 'Moderation Hub' : 'Delete Account'}</span>
            </div>
            <div className="slide-panel-body">
              {settingsMsg.text && (
                <div style={{margin:'12px 20px', padding:'10px 14px', borderRadius:'8px', background: settingsMsg.type === 'success' ? 'rgba(0,168,132,0.15)' : 'rgba(241,92,109,0.15)', color: settingsMsg.type === 'success' ? 'var(--primary)' : 'var(--danger)', fontSize:'0.85rem'}}>
                  {settingsMsg.text}
                </div>
              )}

              {settingsView === 'main' && (
                <>
                  {/* Avatar section */}
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'28px 20px 20px',borderBottom:'1px solid var(--border)',gap:'12px'}}>
                    <input type="file" ref={avatarInputRef} style={{display:'none'}} accept="image/*" onChange={handleAvatarChange} />
                    <div className="avatar-edit-wrap" onClick={() => avatarInputRef.current.click()}>
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt={user.name} style={{width:'100%',height:'100%',objectFit:'cover'}} />
                      ) : (
                        <div style={{width:'100px',height:'100px',borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.5rem',fontWeight:'bold',color:'#fff'}}>
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="avatar-edit-overlay">
                        <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><circle cx="12" cy="13" r="3"/></svg>
                        <span>Change Photo</span>
                      </div>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <div className="text-main font-bold" style={{fontSize:'1.1rem'}}>{user.name}</div>
                      <div className="text-muted" style={{marginTop:'4px'}}>{user.description || 'No bio yet'}</div>
                    </div>
                  </div>
                  {/* Navigation Tabs */}
                  <button className="settings-tab-btn" onClick={() => { setSettingsView('name'); setEditName(user.name || ''); }}>
                    <svg className="tab-icon" style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                    <div><div>Change Name</div><div className="text-muted" style={{fontSize:'0.78rem'}}>{user.name}</div></div>
                  </button>
                  <button className="settings-tab-btn" onClick={() => { setSettingsView('bio'); setEditDescription(user.description || ''); }}>
                    <svg className="tab-icon" style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    <div><div>Bio / Description</div><div className="text-muted" style={{fontSize:'0.78rem'}}>{user.description || 'Not set'}</div></div>
                  </button>
                  <button className="settings-tab-btn" onClick={() => { setSettingsView('password'); setOldPassword(''); setNewPassword(''); setNewPassword2(''); }}>
                    <svg className="tab-icon" style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                    <div>Change Password</div>
                  </button>
                  {user.is_admin && (
                    <button className="settings-tab-btn" onClick={() => { setSettingsView('moderation'); fetchLearnedWords(); }}>
                      <svg className="tab-icon" style={{width:'20px',height:'20px',color:'var(--primary)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                      <div>
                        <div>RoseShield Moderation</div>
                        <div className="text-muted" style={{fontSize:'0.78rem'}}>Manage auto-learned bypasses</div>
                      </div>
                    </button>
                  )}
                  <button className="settings-tab-btn" onClick={() => setSettingsView('delete')} style={{color:'var(--danger)'}}>
                    <svg className="tab-icon" style={{width:'20px',height:'20px',color:'var(--danger)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    <div>Delete Account</div>
                  </button>
                </>
              )}

              {settingsView === 'bio' && (
                <div className="panel-section">
                  <div className="panel-section-title">Your Bio</div>
                  <textarea
                    className="input-field"
                    style={{width:'100%',minHeight:'100px',resize:'vertical',fontFamily:'inherit'}}
                    placeholder="Available"
                    value={editDescription}
                    onChange={e => setEditDescription(e.target.value)}
                    maxLength={120}
                  />
                  <div className="text-muted" style={{textAlign:'right',marginTop:'4px',fontSize:'0.75rem'}}>{editDescription.length}/120</div>
                  <button className="btn-primary" style={{width:'100%',marginTop:'16px'}} disabled={settingsLoading} onClick={handleSaveBio}>
                    {settingsLoading ? 'Saving...' : 'Save Bio'}
                  </button>
                </div>
              )}

              {settingsView === 'name' && (
                <div className="panel-section">
                  <div className="panel-section-title">Your Display Name</div>
                  <div className="auth-input-group" style={{marginBottom:'16px'}}>
                    <label className="text-muted" style={{fontSize:'0.78rem'}}>NEW NAME</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Enter your name"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      maxLength={50}
                    />
                    <div className="text-muted" style={{textAlign:'right',marginTop:'4px',fontSize:'0.75rem'}}>{editName.length}/50</div>
                  </div>
                  <button className="btn-primary" style={{width:'100%'}} disabled={settingsLoading || !editName.trim()} onClick={handleSaveName}>
                    {settingsLoading ? 'Saving...' : 'Save Name'}
                  </button>
                </div>
              )}

              {settingsView === 'password' && (
                <div className="panel-section">
                  <div className="panel-section-title">Change Password</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <div className="auth-input-group">
                      <label className="text-muted" style={{fontSize:'0.78rem'}}>CURRENT PASSWORD</label>
                      <input type="password" className="input-field" value={oldPassword} onChange={e => setOldPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    <div className="auth-input-group">
                      <label className="text-muted" style={{fontSize:'0.78rem'}}>NEW PASSWORD</label>
                      <input type="password" className="input-field" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    <div className="auth-input-group">
                      <label className="text-muted" style={{fontSize:'0.78rem'}}>CONFIRM NEW PASSWORD</label>
                      <input type="password" className="input-field" value={newPassword2} onChange={e => setNewPassword2(e.target.value)} placeholder="••••••••" />
                    </div>
                    <button className="btn-primary" style={{marginTop:'8px'}} disabled={settingsLoading || !oldPassword || !newPassword || !newPassword2} onClick={handleChangePassword}>
                      {settingsLoading ? 'Updating...' : 'Update Password'}
                    </button>
                  </div>
                </div>
              )}

              {settingsView === 'moderation' && (
                <div className="panel-section">
                  <div className="panel-section-title">Self-Learned Patterns</div>
                  <p className="text-muted" style={{fontSize:'0.85rem', marginBottom:'16px'}}>These words were learned by the AI or manually reported by you. Deleting a word will unblock it.</p>
                  
                  <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
                    {learnedWords.length === 0 ? (
                      <p className="text-muted" style={{textAlign:'center', padding:'20px'}}>No words learned yet.</p>
                    ) : learnedWords.map((item, idx) => (
                      <div key={idx} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.05)', borderRadius:'8px', border:'1px solid var(--border)'}}>
                        <div>
                          <div className="text-main font-bold">{item.word}</div>
                          <div className="text-muted" style={{fontSize:'0.7rem'}}>{item.meta}</div>
                        </div>
                        <button className="btn-icon" onClick={() => handleRemoveLearnedWord(item.word)} title="Remove Word">
                          <svg style={{width:'18px', height:'18px', color:'var(--danger)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {settingsView === 'delete' && (
                <div className="panel-section">
                  <div className="panel-section-title">Danger Zone</div>
                  <p className="text-muted" style={{marginBottom:'20px',lineHeight:'1.6'}}>Deleting your account will permanently remove your profile and all your messages. This action <strong style={{color:'var(--danger)'}}>cannot be undone</strong>.</p>
                  <button className="btn-danger" onClick={handleDeleteAccount}>Delete My Account Permanently</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sidebar Tab Bar */}
        <div className="sidebar-tab-bar">
          <button className={`sidebar-tab-btn ${sidebarTab==='chats'?'active':''}`} onClick={() => setSidebarTab('chats')}>
            <svg style={{width:'18px',height:'18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
            Chats
          </button>
          <button className={`sidebar-tab-btn ${sidebarTab==='calls'?'active':''}`} onClick={() => setSidebarTab('calls')}>
            <svg style={{width:'18px',height:'18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
            Calls
          </button>
        </div>

        {sidebarTab === 'chats' ? (
          <>
            {/* Search */}
            <div className="search-container">
              <form onSubmit={handleSearchUser} style={{position: 'relative'}}>
                <input type="text" className="search-input" placeholder="Search user ID to chat..." value={targetIdInput} onChange={(e) => setTargetIdInput(e.target.value)} />
                <svg style={{position:'absolute', right:'16px', top:'10px', width:'18px', height:'18px', color:'var(--text-muted)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </form>
            </div>
            <div className="chat-list">
              {recentChats.length > 0 ? (
                recentChats.map((chat) => (
                  <div key={chat.id} className={`chat-item ${chattingWith?.id === chat.id ? 'active' : ''}`} onClick={() => { setChattingWith(chat); setMessages([]); setSidebarTab('chats'); }}>
                    {chat.avatar_url ? (
                      <img src={chat.avatar_url} alt={chat.username} style={{width:'48px',height:'48px',borderRadius:'50%',objectFit:'cover',flexShrink:0,marginRight:'16px'}} />
                    ) : (
                      <div className="avatar">{chat.username.charAt(0).toUpperCase()}</div>
                    )}
                    <div style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
                      <span className="text-main font-bold truncate">{chat.username}</span>
                      <span className="text-muted truncate">User ID: {chat.id}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{padding:'32px 16px',textAlign:'center'}}>
                  <span className="text-muted">No recent chats. Search an ID to start.</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="chat-list">
            {callHistory.length === 0 ? (
              <div style={{padding:'32px 16px',textAlign:'center'}}>
                <svg style={{width:'40px',height:'40px',color:'var(--text-muted)',margin:'0 auto 12px',display:'block'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                <span className="text-muted">No call history yet.</span>
              </div>
            ) : callHistory.map((c) => {
              const isMissed = c.status === 'missed' || c.status === 'rejected';
              const iconColor = isMissed ? 'var(--danger)' : c.direction === 'incoming' ? 'var(--primary)' : 'var(--text-muted)';
              return (
                <div key={c.id} className="call-history-item">
                  <div className="call-direction-icon">
                    {c.type === 'video' ? (
                      <svg style={{width:'20px',height:'20px',color:iconColor}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    ) : (
                      <svg style={{width:'20px',height:'20px',color:iconColor}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
                    )}
                  </div>
                  <div style={{marginRight:'4px'}}>
                    {c.partner_avatar ? (
                      <img src={c.partner_avatar} alt="" style={{width:'32px',height:'32px',borderRadius:'50%',objectFit:'cover'}} />
                    ) : (
                      <div className="avatar" style={{width:'32px',height:'32px',fontSize:'0.8rem',marginRight:'0'}}>
                        {c.partner_name?.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="text-main font-bold truncate">{c.partner_name}</div>
                    <div className="text-muted" style={{fontSize:'0.78rem'}}>
                      {isMissed ? <span style={{color:'var(--danger)'}}>{c.direction === 'incoming' ? 'Missed' : 'Not answered'}</span> : c.direction === 'incoming' ? 'Incoming' : 'Outgoing'}
                      {' · '}{new Date(c.started_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',day:'numeric',month:'short'})}
                    </div>
                  </div>
                  {c.duration_seconds > 0 && <div className="text-muted" style={{fontSize:'0.78rem',flexShrink:0}}>{formatDuration(c.duration_seconds)}</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Chat Area - Hidden on mobile if NOT chatting */}
      <div className={`main-chat ${!chattingWith ? 'hidden-mobile' : ''}`}>
        {chattingWith ? (
          <>
            {/* Chat Header */}
            <div className="panel-header" style={{borderBottom: '1px solid var(--border)', cursor:'pointer'}} onClick={() => setShowContactInfo(v => !v)} title="View profile">
              <div style={{display: 'flex', alignItems: 'center'}}>
                <button className="mobile-back-btn" onClick={(e) => { e.stopPropagation(); setChattingWith(null); setShowContactInfo(false); }}>
                  <svg style={{width:'20px', height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                  </svg>
                </button>
                <div style={{marginRight:'12px'}}>
                  {chattingWith.avatar_url ? (
                    <img src={chattingWith.avatar_url} alt={chattingWith.username} style={{width:'36px',height:'36px',borderRadius:'50%',objectFit:'cover'}} />
                  ) : (
                    <div className="avatar" style={{width:'36px',height:'36px',fontSize:'1rem',marginRight:'0'}}>
                      {chattingWith.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
                  <span className="text-main font-bold truncate" style={{maxWidth: '200px'}}>{chattingWith.username}</span>
                  <div style={{display: 'flex', alignItems: 'center', gap: '5px'}}>
                    {otherUserOnline === null ? (
                      <span className="text-muted" style={{fontSize: '0.72rem'}}>checking...</span>
                    ) : otherUserOnline ? (
                      <><span className="presence-dot presence-dot--online" /><span style={{fontSize:'0.72rem',color:'var(--primary)',fontWeight:'600'}}>Online</span></>
                    ) : (
                      <><span className="presence-dot presence-dot--offline" /><span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:'500'}}>Offline</span></>
                    )}
                    <div style={{width:'1px', height:'10px', background:'var(--border)', margin:'0 4px'}} />
                    <div style={{display:'flex', alignItems:'center', gap:'4px'}} title="RoseShield Cloud AI engine is active">
                      <svg style={{width:'10px', height:'10px', color:'var(--primary)'}} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                      <span style={{fontSize:'0.65rem', color:'var(--primary)', fontWeight:'bold', letterSpacing:'0.02em'}}>SHIELD LIVE</span>
                    </div>
                  </div>
                </div>
              </div>
              {/* Audio + Video Call Buttons */}
              <button className="btn-icon" title="Voice Call" onClick={(e) => { e.stopPropagation(); startCall('audio'); }}>
                <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
              </button>
              <button className="btn-icon" title="Video Call" onClick={(e) => { e.stopPropagation(); startCall('video'); }}>
                <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
              </button>
              <button className="btn-icon" title="Contact info" onClick={(e) => { e.stopPropagation(); setShowContactInfo(v => !v); }}>
                <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16v-4m0-4h.01"/></svg>
              </button>
            </div>

            {/* Contact Info Panel */}
            {showContactInfo && (
              <div className="contact-info-panel">
                <div className="slide-panel-header">
                  <button className="btn-icon" onClick={() => setShowContactInfo(false)}>
                    <svg style={{width:'20px',height:'20px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                  </button>
                  <span className="text-main font-bold">Contact Info</span>
                </div>
                <div className="slide-panel-body">
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 20px',borderBottom:'1px solid var(--border)',gap:'16px'}}>
                    {chattingWith.avatar_url ? (
                      <img src={chattingWith.avatar_url} alt={chattingWith.username} className="profile-avatar-lg" />
                    ) : (
                      <div className="profile-avatar-initials-lg">
                        {chattingWith.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div style={{textAlign:'center'}}>
                      <div className="text-main font-bold" style={{fontSize:'1.2rem'}}>{chattingWith.username}</div>
                      <div className="text-muted" style={{marginTop:'4px',fontSize:'0.9rem'}}>{chattingWith.description || 'No bio set'}</div>
                    </div>
                  </div>
                  <div className="panel-section">
                    <div className="panel-section-title">User ID</div>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0'}}>
                      <span className="text-main font-mono">{chattingWith.id}</span>
                      <button className="btn-icon" onClick={() => navigator.clipboard.writeText(String(chattingWith.id))} title="Copy">
                        <svg style={{width:'16px',height:'16px',color:'var(--primary)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                      </button>
                    </div>
                  </div>
                  {chattingWith.description && (
                    <div className="panel-section" style={{borderTop:'1px solid var(--border)'}}>
                      <div className="panel-section-title">About</div>
                      <p className="text-muted" style={{lineHeight:'1.6'}}>{chattingWith.description}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Chat Messages */}
            <div className="messages-area" ref={messagesAreaRef} onScroll={handleScroll} style={{position: 'relative'}}>
              {messages.map((msg) => {
                const isMine = Number(msg.sender_id) === Number(user.id);
                const isOffensive = msg.is_offensive;
                
                let renderContent;
                if (isOffensive) {
                  if (isMine) {
                     renderContent = (
                       <div className="blocked-note" style={{marginTop: 0, background: 'transparent', padding: 0}}>
                          <svg style={{width: '18px', height: '18px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                          <span style={{fontWeight: '600'}}>Flagged content hidden</span>
                       </div>
                     );
                  } else {
                     renderContent = (
                       <span style={{fontStyle: 'italic', color: 'rgba(255,255,255,0.5)'}}>
                         This message is unavailable
                       </span>
                     );
                  }
                } else if (msg.type === 'image' && msg.content && (msg.content.startsWith('data:image') || msg.content.startsWith('/uploads') || msg.content.startsWith('http'))) {
                  renderContent = (
                     <div>
                       <img 
                        src={msg.content} 
                        alt="Attached" 
                        className="chat-img-attachment"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                       />
                       <div style={{display: 'none', padding: '20px', textAlign: 'center', background: 'rgba(0,0,0,0.2)', borderRadius: '6px'}}>
                         <p className="text-muted">Image failed to load</p>
                       </div>
                     </div>
                  );
                } else {
                  renderContent = (
                     <span style={{color: '#fff'}}>{msg.content}</span>
                  );
                }

                return (
                  <div key={msg.id} className={`message-row ${isMine ? 'sent' : 'received'}`}>
                    <div className="message-bubble">
                      {renderContent}

                      <span className="message-time" style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                        {user.is_admin && !isOffensive && !isMine && (
                          <button 
                            className="btn-icon" 
                            style={{padding: 0, marginRight: '4px', opacity: 0.6}} 
                            onClick={() => handleReportMessage(msg)}
                            title="Report & Learn Pattern"
                          >
                            <svg style={{width:'14px', height:'14px', color:'var(--danger)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-7h.01M9 16h.01" />
                            </svg>
                          </button>
                        )}
                        {new Date(msg.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                        {isMine && (
                          <span style={{display: 'flex', marginTop: '1px'}}>
                            {msg.status === 'seen' ? (
                              <svg style={{width:'15px', height:'15px', color:'#53bdeb'}} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M1 13l4 4L15 7M6 13l4 4L20 7" />
                              </svg>
                            ) : msg.status === 'delivered' ? (
                              <svg style={{width:'15px', height:'15px', color:'var(--text-muted)'}} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M1 13l4 4L15 7M6 13l4 4L20 7" />
                              </svg>
                            ) : (
                              <svg style={{width:'13px', height:'13px', color:'var(--text-muted)'}} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
              
              {/* Discreet Image Loader */}
              {isScanning && (
                <div style={{
                  position: 'sticky', bottom: '10px', left: '0', right: '0',
                  display: 'flex', justifyContent: 'center', zIndex: 30, pointerEvents: 'none'
                }}>
                  <div style={{
                    background: 'var(--panel-bg)', padding: '8px 16px', borderRadius: '20px',
                    display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid var(--border)',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
                  }}>
                    <div className="scanning-spinner" style={{width: '18px', height: '18px'}} />
                    <span style={{fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: '500'}}>Processing...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Floating Go Down Button with Badge overlay on top of messages area */}
            {isScrolledUp && (
              <button 
                className="scroll-to-bottom-btn" 
                onClick={scrollToBottom}
                style={{
                  position: 'absolute', bottom: '70px', right: '20px', 
                  width: '42px', height: '42px', borderRadius: '50%',
                  background: 'var(--panel-bg)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', zIndex: 10, boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                }}
              >
                 <svg style={{width:'22px', height:'22px', color:'var(--text-muted)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3"/>
                 </svg>
                 {unreadScrollCount > 0 && (
                   <div style={{
                     position: 'absolute', top: '-4px', right: '-4px', background: 'var(--primary)',
                     color: '#111b21', fontSize: '0.75rem', fontWeight: 'bold', width: '22px', height: '22px',
                     borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'
                   }}>
                     {unreadScrollCount}
                   </div>
                 )}
              </button>
            )}

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="chat-footer">
              <button type="button" className="attachment-btn" onClick={() => fileInputRef.current.click()} title="Send Image">
                <svg style={{width:'22px', height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                <input type="file" ref={fileInputRef} className="hidden" style={{display: 'none'}} accept="image/*" onChange={handleImageUpload} />
              </button>
              
              <input 
                type="text" 
                className="input-field" 
                style={{flex: 1, border: 'none', background: 'var(--app-bg)'}} 
                placeholder="Type a message" 
                value={newMessage} 
                onChange={(e) => setNewMessage(e.target.value)} 
              />
              
              <button type="submit" className="attachment-btn" disabled={!newMessage.trim()} style={{color: newMessage.trim() ? 'var(--primary)' : 'var(--text-muted)'}}>
                 <svg style={{width:'22px', height:'22px', transform: 'rotate(45deg)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              </button>
            </form>
          </>
        ) : (
          <div className="empty-chat">
             <div style={{width:'100px', height:'100px', borderRadius:'50%', background:'var(--panel-bg)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'24px'}}>
               <svg style={{width:'48px', height:'48px', color:'var(--text-muted)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
             </div>
             <h2 className="text-main" style={{marginBottom:'8px', fontWeight:'lighter'}}>RoseShield for Web</h2>
             <p className="text-muted">Send and receive encrypted messages effortlessly.</p>
          </div>
        )}
      </div>
    </div>

    {/* ── Incoming Call Toast ── */}
    {incomingCall && callStatus === 'idle' && (
      <div className="incoming-call-toast">
        {incomingCall.caller_avatar ? (
          <img src={incomingCall.caller_avatar} alt={incomingCall.caller_name} style={{width:'60px',height:'60px',borderRadius:'50%',objectFit:'cover',border:'2px solid var(--primary)'}} />
        ) : (
          <div style={{width:'60px',height:'60px',borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',fontWeight:'bold',color:'#fff',border:'2px solid var(--primary)'}}>
            {incomingCall.caller_name?.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{textAlign:'center'}}>
          <div className="text-main font-bold">{incomingCall.caller_name}</div>
          <div className="text-muted" style={{fontSize:'0.82rem',marginTop:'2px'}}>{incomingCall.type === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call'}</div>
        </div>
        <div className="incoming-call-btn-row">
          <button className="call-ctrl-btn end" onClick={rejectCall} title="Reject">
            <svg style={{width:'22px',height:'22px',transform:'rotate(135deg)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          </button>
          <button className="call-ctrl-btn accept" onClick={acceptCall} title="Accept">
            <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          </button>
        </div>
      </div>
    )}

    {/* ── Active Call Overlay ── */}
    {callStatus !== 'idle' && activeCall && (
      <div className="call-overlay">
        <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline
          style={{display: activeCall.type === 'video' ? 'block' : 'none'}} />
        <video ref={localVideoRef} className="call-local-pip" autoPlay playsInline muted
          style={{display: activeCall.type === 'video' ? 'block' : 'none'}} />
        <div className="call-center-content">
          <div className="call-ring-wrap">
            {activeCall.partner?.avatar_url ? (
              <img src={activeCall.partner.avatar_url} alt="" style={{width:'100px',height:'100px',borderRadius:'50%',objectFit:'cover',position:'relative',zIndex:2}} />
            ) : (
              <div style={{width:'100px',height:'100px',borderRadius:'50%',background:'#6366f1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'2.5rem',fontWeight:'bold',color:'#fff',position:'relative',zIndex:2}}>
                {activeCall.partner?.username?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div style={{color:'#fff',textAlign:'center'}}>
            <div style={{fontSize:'1.3rem',fontWeight:'bold'}}>{activeCall.partner?.username}</div>
            <div style={{fontSize:'0.85rem',color:'rgba(255,255,255,0.6)',marginTop:'4px'}}>
              {callStatus === 'ringing' ? (activeCall.direction === 'outgoing' ? 'Calling...' : 'Connecting...') : formatDuration(callDuration)}
            </div>
            {callStatus === 'active' && activeCall.type === 'video' && isScreenSharing && (
              <div style={{fontSize:'0.78rem',color:'var(--primary)',marginTop:'4px'}}>📺 Screen sharing</div>
            )}
          </div>
        </div>
        <div className="call-controls">
          <button className={`call-ctrl-btn ${isMuted ? 'active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? (
              <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" fillRule="evenodd"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
            ) : (
              <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg>
            )}
          </button>
          {activeCall.type === 'video' && (
            <button className={`call-ctrl-btn ${isCameraOff ? 'active' : ''}`} onClick={toggleCamera} title={isCameraOff ? 'Turn on camera' : 'Turn off camera'}>
              <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82V15.18a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
          )}
          {activeCall.type === 'video' && (
            <button className={`call-ctrl-btn ${isScreenSharing ? 'active' : ''}`} onClick={startScreenShare} title={isScreenSharing ? 'Stop sharing' : 'Share screen'}>
              <svg style={{width:'22px',height:'22px'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            </button>
          )}
          <button className="call-ctrl-btn end" onClick={endCall} title="End call">
            <svg style={{width:'22px',height:'22px',transform:'rotate(135deg)'}} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
          </button>
        </div>
      </div>
    )}
  </>
  );
}
