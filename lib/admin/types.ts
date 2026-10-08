export const leadStatuses = ["New", "Contacted", "In Progress", "Converted", "Closed"] as const;
export type LeadStatus = (typeof leadStatuses)[number];
export type LeadNote = { id: string; title: string; text: string; createdAt: string };
export type Lead = {
  id: string; name: string; email: string; phone: string; company: string;
  service: string; source: string; submittedAt: string; status: LeadStatus;
  description: string; priority: boolean; notes: LeadNote[];
};
