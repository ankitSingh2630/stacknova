export const leadStatuses = ["New", "Contacted", "In Progress", "Converted", "Closed"] as const;
export type LeadStatus = (typeof leadStatuses)[number];
export type Lead = {
  id: string; name: string; email: string; phone: string; company: string;
  service: string; source: string; status: LeadStatus; message: string; notes: string;
  deletedAt: string | null; createdAt: string; updatedAt: string;
};
