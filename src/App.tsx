import React, { useState, useEffect } from 'react';
import { auth, db, signInWithGoogle, signInAsGuest, logOut } from './lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Heart, BarChart2, LogIn, LogOut, RefreshCw, X, MapPin, CheckCircle2, UserCircle, History } from 'lucide-react';
import { generateStories, Story as GeminiStory } from './lib/gemini';
import ReactMarkdown from 'react-markdown';
import { StoryRecord, UserProfile } from './types';
import GrowthReport from './components/GrowthReport';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'today' | 'history' | 'favorites' | 'report'>('today');
  const [stories, setStories] = useState<GeminiStory[]>([]);
  const [history, setHistory] = useState<StoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStory, setSelectedStory] = useState<GeminiStory | StoryRecord | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            photoURL: u.photoURL || '',
            unlikedThemes: []
          };
          await setDoc(userRef, newProfile);
          setProfile(newProfile);
        } else {
          setProfile(userSnap.data() as UserProfile);
        }

        // Listen to history
        const historyQuery = query(collection(db, 'users', u.uid, 'stories'), orderBy('readAt', 'desc'));
        const unsubHistory = onSnapshot(historyQuery, (snap) => {
          setHistory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StoryRecord)));
        });
        return () => unsubHistory();
      } else {
        setProfile(null);
        setHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleRefresh = async () => {
    if (!user) return;
    setLoading(true);
    setGenError(null);
    try {
      // Filter out both read and unliked stories
      const excludedTitles = history
        .filter(h => h.isRead || h.isUnliked)
        .map(h => h.title);
      
      const newStories = await generateStories(profile?.unlikedThemes || [], excludedTitles);
      setStories(newStories);
    } catch (error: any) {
      console.error("Failed to generate stories:", error);
      setGenError("故事生成失败，请稍后重试。错误信息: " + (error.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'today' && stories.length === 0) {
      handleRefresh();
    }
  }, [user, activeTab]);

  const markAsRead = async (story: GeminiStory | StoryRecord) => {
    if (!user) return;

    if ('id' in story) {
      const record = story as StoryRecord;
      await updateDoc(doc(db, 'users', user.uid, 'stories', record.id), { isRead: true });
      setSelectedStory({ ...record, isRead: true });
    } else {
      const record: Omit<StoryRecord, 'id'> = {
        title: story.title,
        content: story.content,
        type: story.type,
        originCountry: story.originCountry,
        readAt: Date.now(),
        userId: user.uid,
        isRead: true,
        isUnliked: false,
        isFavorite: false
      };
      const docRef = await addDoc(collection(db, 'users', user.uid, 'stories'), record);
      setStories(prev => prev.filter(s => s.title !== story.title));
      setSelectedStory({ id: docRef.id, ...record });
    }
  };

  const toggleFavorite = async (story: GeminiStory | StoryRecord) => {
    if (!user) return;

    if ('id' in story) {
      // It's already a record in history
      const record = story as StoryRecord;
      const newStatus = !record.isFavorite;
      await updateDoc(doc(db, 'users', user.uid, 'stories', record.id), { isFavorite: newStatus });
      setSelectedStory({ ...record, isFavorite: newStatus });
    } else {
      // It's a fresh story, save it as favorite (not necessarily read)
      const record: Omit<StoryRecord, 'id'> = {
        title: story.title,
        content: story.content,
        type: story.type,
        originCountry: story.originCountry,
        readAt: Date.now(),
        userId: user.uid,
        isRead: false,
        isUnliked: false,
        isFavorite: true
      };
      const docRef = await addDoc(collection(db, 'users', user.uid, 'stories'), record);
      setStories(prev => prev.filter(s => s.title !== story.title));
      setSelectedStory({ id: docRef.id, ...record });
    }
  };

  const handleUnlike = async (story: GeminiStory | StoryRecord) => {
    if (!user || !profile) return;
    
    // Add to unliked themes (simplified: using title keywords for now)
    const newUnliked = [...profile.unlikedThemes, story.title];
    await updateDoc(doc(db, 'users', user.uid), { unlikedThemes: newUnliked });
    setProfile({ ...profile, unlikedThemes: newUnliked });

    if ('id' in story) {
      // It's a record from history
      await updateDoc(doc(db, 'users', user.uid, 'stories', story.id), { isUnliked: true });
    } else {
      // It's a fresh story
      setStories(prev => prev.filter(s => s.title !== story.title));
    }
    setSelectedStory(null);
  };

  const handleLogin = async (provider: 'google' | 'guest') => {
    setLoginError(null);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInAsGuest();
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError("域名未授权：请在 Firebase 控制台中将当前域名添加到 'Authorized domains' 列表。");
      } else if (error.code === 'auth/operation-not-allowed' || error.code === 'auth/admin-restricted-operation') {
        setLoginError("该登录方式未启用：请在 Firebase 控制台的 Authentication > Sign-in method 中启用相应的登录方式（如 Google 或 Anonymous）。");
      } else if (error.code === 'auth/popup-blocked') {
        setLoginError("弹窗被拦截：请允许浏览器弹出窗口。");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setLoginError("登录窗口已关闭。");
      } else {
        setLoginError("登录失败：" + error.message);
      }
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-brand-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-8 w-full max-w-sm"
        >
          <div className="w-24 h-24 bg-brand-red rounded-3xl flex items-center justify-center mx-auto shadow-xl">
            <BookOpen className="w-12 h-12 text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-brand-navy">小熊睡前故事</h1>
            <p className="text-brand-muted">为宝贝开启奇妙的故事之旅</p>
          </div>
          
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => handleLogin('google')}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-brand-navy text-white rounded-2xl font-medium hover:bg-brand-blue transition-colors shadow-lg"
            >
              <LogIn className="w-5 h-5" />
              使用 Google 登录
            </button>
            <button 
              onClick={() => handleLogin('guest')}
              className="flex items-center justify-center gap-3 px-8 py-4 bg-brand-muted/10 text-brand-navy rounded-2xl font-medium hover:bg-brand-muted/20 transition-colors"
            >
              <UserCircle className="w-5 h-5" />
              免登录体验 (游客模式)
            </button>
          </div>

          {loginError && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-brand-red/10 text-brand-red text-sm rounded-xl border border-brand-red/20"
            >
              {loginError}
            </motion.div>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32 bg-brand-white">
      {/* Header */}
      <header className="glass-header px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-brand-red rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-display font-bold text-lg text-brand-navy leading-none">小熊睡前故事</span>
            {user.isAnonymous ? (
              <span className="text-[10px] text-brand-red font-bold uppercase tracking-tighter">游客模式</span>
            ) : (
              <span className="text-[10px] text-brand-blue font-bold uppercase tracking-tighter">已登录: {user.displayName || '用户'}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!user.isAnonymous && user.photoURL && (
            <img 
              src={user.photoURL} 
              alt={user.displayName || ''} 
              className="w-8 h-8 rounded-full border border-brand-muted/20"
              referrerPolicy="no-referrer"
            />
          )}
          <button onClick={logOut} className="p-2 text-brand-muted hover:text-brand-red transition-colors" title="退出登录">
            <LogOut className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 py-8 space-y-2">
        <p className="text-brand-muted font-medium uppercase tracking-widest text-xs">
          {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
        </p>
        <h2 className="text-4xl font-display font-bold text-brand-navy">
          {activeTab === 'today' ? '今日故事' : activeTab === 'history' ? '小熊已读' : activeTab === 'favorites' ? '小熊最爱' : '成长报告'}
        </h2>
      </section>

      {/* Main Content */}
      <main className="px-6">
        <AnimatePresence mode="wait">
          {activeTab === 'today' && (
            <motion.div 
              key="today"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-brand-muted text-sm">每天为你准备 10 个新鲜故事</p>
                <button 
                  onClick={handleRefresh}
                  disabled={loading}
                  className="flex items-center gap-2 text-brand-blue font-semibold text-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  换一批
                </button>
              </div>

              {loading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-4">
                  <div className="w-12 h-12 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
                  <p className="text-brand-muted font-medium">正在为你编织奇妙故事...</p>
                </div>
              ) : genError ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-brand-red/10 rounded-full flex items-center justify-center mx-auto">
                    <RefreshCw className="w-8 h-8 text-brand-red" />
                  </div>
                  <p className="text-brand-red font-medium">{genError}</p>
                  <button 
                    onClick={handleRefresh}
                    className="px-6 py-2 bg-brand-red text-white rounded-full text-sm font-bold"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {stories.map((story, i) => (
                    <motion.div 
                      key={story.title}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedStory(story)}
                      className="aspect-square bg-white rounded-2xl shadow-sm border border-brand-muted/10 hover:shadow-xl hover:border-brand-red/20 transition-all duration-300 cursor-pointer group flex flex-col relative overflow-hidden"
                    >
                      {/* Story Cover Image */}
                      <div className="absolute inset-0 z-0 bg-brand-muted/5">
                        <img 
                          src={`https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=400&q=80&sig=${encodeURIComponent(story.imageSearchTerm || story.title)}`}
                          alt={story.title}
                          className="w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity duration-500"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(story.title)}`;
                          }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/40 to-transparent" />
                      </div>

                      <div className="z-10 p-4 flex flex-col justify-between h-full">
                        <div className="flex flex-wrap gap-1">
                          <span className="px-2 py-1 bg-brand-muted/10 text-brand-blue text-[10px] font-bold rounded-md uppercase tracking-wider">
                            {story.type}
                          </span>
                          {history.some(h => h.title === story.title && h.isRead) && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-[10px] font-bold rounded-md flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              已读
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <h3 className="text-brand-navy font-display font-bold text-sm md:text-base leading-tight group-hover:text-brand-red transition-colors line-clamp-3">
                            {story.title}
                          </h3>
                          <p className="text-[10px] text-brand-muted font-medium">
                            {story.originCountry}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {history.filter(h => !h.isUnliked && h.isRead).length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-brand-muted/10 rounded-full flex items-center justify-center mx-auto">
                    <History className="w-8 h-8 text-brand-muted" />
                  </div>
                  <p className="text-brand-muted">还没有读过的故事哦</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {history.filter(h => !h.isUnliked && h.isRead).map((record, i) => (
                    <motion.div 
                      key={record.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedStory(record)}
                      className="aspect-square bg-white rounded-2xl p-4 shadow-sm border border-brand-muted/10 hover:shadow-xl hover:border-brand-red/20 transition-all duration-300 cursor-pointer group flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <History className="w-12 h-12 text-brand-navy" />
                      </div>
                      
                      <div className="z-10 flex flex-col gap-1">
                        <span className="px-2 py-1 bg-brand-muted/10 text-brand-blue text-[10px] font-bold rounded-md uppercase tracking-wider w-fit">
                          {record.type}
                        </span>
                        <span className="text-[10px] text-brand-muted font-bold">
                          {new Date(record.readAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <div className="z-10 space-y-1">
                        <h3 className="text-brand-navy font-display font-bold text-sm md:text-base leading-tight group-hover:text-brand-red transition-colors line-clamp-3">
                          {record.title}
                        </h3>
                        <p className="text-[10px] text-brand-muted font-medium">
                          {record.originCountry}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'favorites' && (
            <motion.div 
              key="favorites"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {history.filter(h => !h.isUnliked && h.isFavorite).length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-brand-muted/10 rounded-full flex items-center justify-center mx-auto">
                    <Heart className="w-8 h-8 text-brand-muted" />
                  </div>
                  <p className="text-brand-muted">还没有收藏的故事哦</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {history.filter(h => !h.isUnliked && h.isFavorite).map((record, i) => (
                    <motion.div 
                      key={record.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setSelectedStory(record)}
                      className="aspect-square bg-white rounded-2xl p-4 shadow-sm border border-brand-muted/10 hover:shadow-xl hover:border-brand-red/20 transition-all duration-300 cursor-pointer group flex flex-col justify-between relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Heart className="w-12 h-12 text-brand-red" />
                      </div>
                      
                      <div className="z-10">
                        <span className="px-2 py-1 bg-brand-muted/10 text-brand-blue text-[10px] font-bold rounded-md uppercase tracking-wider">
                          {record.type}
                        </span>
                      </div>

                      <div className="z-10 space-y-1">
                        <h3 className="text-brand-navy font-display font-bold text-sm md:text-base leading-tight group-hover:text-brand-red transition-colors line-clamp-3">
                          {record.title}
                        </h3>
                        <p className="text-[10px] text-brand-muted font-medium">
                          {record.originCountry}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'report' && (
            <motion.div 
              key="report"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <GrowthReport history={history.filter(h => !h.isUnliked)} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Floating Nav */}
      <nav className="floating-nav">
        <button 
          onClick={() => setActiveTab('today')}
          className={`nav-item ${activeTab === 'today' ? 'active' : ''}`}
        >
          <BookOpen className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
        >
          <History className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setActiveTab('favorites')}
          className={`nav-item ${activeTab === 'favorites' ? 'active' : ''}`}
        >
          <Heart className="w-6 h-6" />
        </button>
        <button 
          onClick={() => setActiveTab('report')}
          className={`nav-item ${activeTab === 'report' ? 'active' : ''}`}
        >
          <BarChart2 className="w-6 h-6" />
        </button>
      </nav>

      {/* Story Modal */}
      <AnimatePresence>
        {selectedStory && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedStory(null)}
            className="fixed inset-0 z-[100] bg-brand-navy/90 backdrop-blur-sm p-4 flex items-center justify-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white w-full max-w-2xl max-h-[90vh] rounded-[40px] overflow-hidden flex flex-col relative shadow-2xl"
            >
              <div className="relative h-48 md:h-64 overflow-hidden bg-brand-muted/5">
                <img 
                  src={`https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=800&q=80&sig=${encodeURIComponent(selectedStory.imageSearchTerm || selectedStory.title)}`}
                  alt={selectedStory.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(selectedStory.title)}`;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent" />
                <button 
                  onClick={() => setSelectedStory(null)}
                  className="absolute top-6 right-6 p-2 bg-white/80 backdrop-blur-md rounded-full hover:bg-brand-red hover:text-white transition-all z-10 shadow-lg"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 pb-4 space-y-4">
                <div className="flex items-center gap-3">
                  <span className="px-4 py-1.5 bg-brand-red/10 text-brand-red text-sm font-bold rounded-full">
                    {selectedStory.type}
                  </span>
                  <span className="flex items-center gap-1 text-brand-muted text-sm">
                    <MapPin className="w-4 h-4" />
                    {selectedStory.originCountry}
                  </span>
                </div>
                <h2 className="text-3xl font-display font-bold text-brand-navy pr-12">
                  {selectedStory.title}
                </h2>
              </div>

              <div className="flex-1 overflow-y-auto p-8 pt-0 custom-scrollbar">
                <div className="markdown-body prose prose-lg max-w-none">
                  <ReactMarkdown>{selectedStory.content}</ReactMarkdown>
                </div>
              </div>

              <div className="p-8 pt-4 border-t border-brand-muted/10 flex gap-4">
                {(selectedStory as StoryRecord).isRead ? (
                   <div className="flex-1 flex items-center gap-2 text-brand-blue font-bold">
                     <CheckCircle2 className="w-6 h-6" />
                     已读完
                   </div>
                ) : (
                  <button 
                    onClick={() => markAsRead(selectedStory)}
                    className="flex-1 bg-brand-red text-white py-4 rounded-2xl font-bold shadow-lg shadow-brand-red/20 hover:scale-[1.02] transition-transform"
                  >
                    已读
                  </button>
                )}
                <button 
                  onClick={() => handleUnlike(selectedStory)}
                  className="px-6 py-4 bg-brand-muted/10 text-brand-muted rounded-2xl font-bold hover:bg-brand-navy hover:text-white transition-all"
                >
                  不喜欢
                </button>
                <button 
                  onClick={() => toggleFavorite(selectedStory)}
                  className={`px-6 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 ${
                    (selectedStory as StoryRecord).isFavorite 
                      ? 'bg-brand-red/10 text-brand-red border border-brand-red/20' 
                      : 'bg-brand-navy/5 text-brand-navy hover:bg-brand-navy/10'
                  }`}
                >
                  <Heart className={`w-5 h-5 ${(selectedStory as StoryRecord).isFavorite ? 'fill-brand-red' : ''}`} />
                  {(selectedStory as StoryRecord).isFavorite ? '取消最爱' : '添加到最爱'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
