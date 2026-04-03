"use client";

import { motion } from "framer-motion";
import { Mic, Phone, Bell, Settings, LogOut, ChevronRight, LayoutDashboard, Users, Calendar, MessageSquare, BarChart3, Puzzle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

export default function Home() {
  const [isArabic, setIsArabic] = useState(false);

  return (
    <main className={`min-h-screen p-8 transition-all duration-500 ${isArabic ? 'rtl font-sans' : 'ltr font-sans'}`}>
      <nav className="flex justify-between items-center mb-12 glass p-4 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brain-orange flex items-center justify-center animate-pulse shadow-lg shadow-orange-500/20">
            <Mic size={24} color="white" />
          </div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-brain-sky">
            {isArabic ? "بسمة" : "Basma AI"}
          </h1>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setIsArabic(!isArabic)}
            className="px-4 py-2 glass hover:bg-white/10 rounded-lg text-sm font-medium transition-colors"
          >
            {isArabic ? "English" : "عربي"}
          </button>
          <Link href="/dashboard" className="px-6 py-2 bg-brain-sky hover:bg-brain-sky/80 text-white rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95">
            {isArabic ? "لوحة التحكم" : "Dashboard"}
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-6"
        >
          <div className="inline-block px-3 py-1 rounded-full glass text-brain-sky text-xs font-bold uppercase tracking-wider mb-2">
            {isArabic ? "الجيل القادم من سكرتارية الذكاء الاصطناعي" : "Next-Gen AI Receptionist"}
          </div>
          <h2 className="text-6xl font-extrabold leading-tight">
            {isArabic ? "مساعدتك الرقمية" : "Your Digital"} <br />
            <span className="text-brain-orange animate-pulse">{isArabic ? "برين سايت" : "BrainSAIT"}</span> {isArabic ? "الأذكى" : "Assistant"}
          </h2>
          <p className="text-gray-400 text-lg leading-relaxed max-w-md">
            {isArabic 
              ? "بسمة هي السكرتيرة الرقمية لبرين سايت، تتحدث اللغتين بطلاقة وتدير مواعيدك وعملائك بكفاءة عالية على مدار الساعة." 
              : "Basma is BrainSAIT's digital concierge. She speaks Arabic and English fluently, managing your schedule and leads 24/7 with hospital-grade security."}
          </p>
          <div className="flex gap-4 pt-4">
            <button className="flex items-center gap-2 px-8 py-4 bg-brain-orange text-white rounded-xl font-bold shadow-xl shadow-orange-500/20 hover:scale-105 transition-all">
              <Phone size={20} />
              {isArabic ? "ابدأ المكالمة" : "Start Voice Call"}
            </button>
            <button className="flex items-center gap-2 px-8 py-4 glass text-white rounded-xl font-bold hover:bg-white/10 transition-all">
              {isArabic ? "استكشف الخدمات" : "View Services"}
            </button>
          </div>
        </motion.div>

        <div className="relative flex justify-center items-center">
          <div className="absolute inset-0 bg-brain-sky/20 blur-[120px] rounded-full animate-pulse" />
          <motion.div 
            animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="w-80 h-80 rounded-full glass flex items-center justify-center p-4 relative z-10 border-brain-sky/30"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-brain-sky/20 to-placeholder-blue/20 rounded-full" />
            <div className="w-64 h-64 rounded-full bg-gradient-to-br from-brain-sky to-brain-blue flex items-center justify-center shadow-2xl relative overflow-hidden">
               {/* Wave animation simulation */}
               <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-white/10 animate-wave-slow opacity-20" />
               <Phone size={80} color="white" className="relative z-20 drop-shadow-lg" />
            </div>
            
            {/* Pulsing satellite circles */}
            <div className="absolute -top-4 -right-4 w-20 h-20 glass rounded-2xl flex items-center justify-center animate-bounce delay-100 items-center justify-center">
               <BarChart3 className="text-brain-sky" />
            </div>
            <div className="absolute -bottom-4 -left-4 w-20 h-20 glass rounded-2xl flex items-center justify-center animate-bounce delay-300">
               <Calendar className="text-brain-orange" />
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
