"use client";

import { motion } from "framer-motion";
import { 
  Users, Calendar, BarChart3, MessageSquare, 
  Search, Filter, Plus, MoreHorizontal, 
  TrendingUp, TrendingDown, Clock, CheckCircle 
} from "lucide-react";
import { useState } from "react";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("all");

  const stats = [
    { label: "Total Visitors", value: "2,543", change: "+12.5%", trending: "up" },
    { label: "Qualified Leads", value: "482", change: "+5.2%", trending: "up" },
    { label: "Appointments", value: "124", change: "-2.1%", trending: "down" },
    { label: "Conversion Rate", value: "18.9%", change: "+3.4%", trending: "up" },
  ];

  const recentVisitors = [
    { id: 1, name: "Dr. Ahmed Khalid", company: "King Saud Hospital", status: "Lead", score: 85, lastContact: "2 hours ago" },
    { id: 2, name: "Sarah Williams", company: "Aramco Health", status: "Customer", score: 92, lastContact: "5 hours ago" },
    { id: 3, name: "Mohammed Al-Zahrani", company: "Dallah Pharma", status: "Visitor", score: 42, lastContact: "Yesterday" },
    { id: 4, name: "Elena Petrova", company: "Global Medical", status: "Lead", score: 71, lastContact: "Yesterday" },
  ];

  return (
    <div className="p-8 space-y-8 ltr">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">Executive Dashboard</h1>
          <p className="text-gray-400 mt-1">Manage Basma's performance and visitor interactions.</p>
        </div>
        <button className="px-6 py-3 bg-brain-sky text-white rounded-xl font-bold flex items-center gap-2 hover:scale-105 transition-all">
          <Plus size={20} />
          Manual Entry
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass p-6 rounded-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-24 h-24 bg-brain-sky/10 blur-3xl -mr-8 -mt-8" />
            <p className="text-sm font-medium text-gray-400">{stat.label}</p>
            <div className="flex items-end justify-between mt-2">
              <h3 className="text-3xl font-bold">{stat.value}</h3>
              <div className={`flex items-center gap-1 text-xs font-bold ${stat.trending === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                {stat.trending === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                {stat.change}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Visitors Table */}
        <div className="lg:col-span-2 glass rounded-3xl overflow-hidden flex flex-col">
          <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <div className="flex gap-4">
              <button className="text-brain-sky font-bold border-b-2 border-brain-sky pb-1">All Visitors</button>
              <button className="text-gray-400 hover:text-white transition">Qualified Leads</button>
              <button className="text-gray-400 hover:text-white transition">Customers</button>
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search..." className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brain-sky/50 w-64" />
              </div>
              <button className="p-2 glass rounded-lg hover:bg-white/10 transition"><Filter size={18} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-white/5 text-gray-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-semibold">Visitor / Company</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Lead Score</th>
                  <th className="px-6 py-4 font-semibold">Last Contact</th>
                  <th className="px-6 py-4 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentVisitors.map((visitor) => (
                  <tr key={visitor.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-bold">{visitor.name}</div>
                      <div className="text-xs text-gray-400">{visitor.company}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        visitor.status === 'Customer' ? 'bg-green-500/10 text-green-400' :
                        visitor.status === 'Lead' ? 'bg-brain-sky/10 text-brain-sky' :
                        'bg-white/10 text-gray-400'
                      }`}>
                        {visitor.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-brain-orange" style={{ width: `${visitor.score}%` }} />
                        </div>
                        <span className="text-xs font-bold">{visitor.score}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400">{visitor.lastContact}</td>
                    <td className="px-6 py-4 text-right">
                      <button className="p-2 hover:bg-white/10 rounded-lg transition opacity-0 group-hover:opacity-100">
                        <MoreHorizontal size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-white/10 text-center">
            <button className="text-sm text-brain-sky font-bold hover:underline">View All Visitors</button>
          </div>
        </div>

        {/* Sidebar Widgets (Recent Activity / Tasks) */}
        <div className="space-y-8">
          <div className="glass p-6 rounded-3xl">
            <h4 className="font-bold mb-4 flex items-center gap-2">
              <Clock size={18} className="text-brain-orange" />
              Recent AI Interactions
            </h4>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 items-start border-l-2 border-brain-orange/50 pl-4 py-1">
                  <div className="flex-1">
                    <p className="text-sm font-medium">Inbound Call Handled</p>
                    <p className="text-xs text-gray-400">Dr. Ahmed Khalid booked a Demo.</p>
                    <span className="text-[10px] text-gray-500">14 minutes ago</span>
                  </div>
                  <CheckCircle size={14} className="text-green-400 mt-1" />
                </div>
              ))}
            </div>
          </div>

          <div className="glass p-6 rounded-3xl bg-brain-sky/5 border-brain-sky/20">
            <h4 className="font-bold mb-2">Basma Status</h4>
            <div className="flex items-center gap-2 mt-4">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-ping" />
              <span className="text-sm font-semibold">Active & Online</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-6">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-xs text-gray-400">Calls Today</p>
                <p className="text-lg font-bold">42</p>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <p className="text-xs text-gray-400">Avg Duration</p>
                <p className="text-lg font-bold">3:12</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
