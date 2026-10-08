"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { mockLeads } from "@/lib/admin/mock-data";
import type { Lead, LeadStatus } from "@/lib/admin/types";

type MockLeadsContext = { leads: Lead[]; updateStatus: (id: string, status: LeadStatus) => void; addNote: (id: string, text: string) => void; deleteLead: (id: string) => void };
const Context = createContext<MockLeadsContext | null>(null);
export default function MockLeadsProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const updateStatus = (id: string, status: LeadStatus) => setLeads(current => current.map(lead => lead.id === id ? { ...lead, status } : lead));
  const addNote = (id: string, text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const note = { id: crypto.randomUUID(), title: "Private Note", text: trimmed, createdAt: new Date().toISOString() };
    setLeads(current => current.map(lead => lead.id === id ? { ...lead, notes: [note, ...lead.notes] } : lead));
  };
  const deleteLead = (id: string) => setLeads(current => current.filter(lead => lead.id !== id));
  return <Context.Provider value={{ leads, updateStatus, addNote, deleteLead }}>{children}</Context.Provider>;
}
export function useMockLeads() {
  const context = useContext(Context);
  if (!context) throw new Error("Admin screens require MockLeadsProvider");
  return context;
}
