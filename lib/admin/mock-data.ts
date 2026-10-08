import { Lead, LeadStatus } from "./types";

export const demoToday = "2026-10-07";
export const services = ["Web Development", "UI/UX Design", "Software Engineering", "Cloud Architecture", "Mobile App Development"];
const description = "We are looking to redesign our existing company website to modernize our tech stack and improve lead conversions. Need scalable architecture and responsive design.";
const seed: Lead[] = [
  { id: "67F83-WEB", name: "Rahul Sharma", email: "rahul@gmail.com", phone: "+91 98765 43210", company: "ABC Technologies", service: services[0], source: "Website Form", submittedAt: "2026-10-07T10:10:00+05:30", status: "New", description, priority: true, notes: [
    { id: "rahul-call", title: "Outbound Call", text: "Called the client. Requested project requirements.", createdAt: "2026-10-07T16:30:00+05:30" },
    { id: "rahul-intake", title: "System Event", text: "Lead submitted through website.", createdAt: "2026-10-07T10:10:00+05:30" },
  ] },
  { id: "68A24-UX", name: "Priya Verma", email: "priya@gmail.com", phone: "+91 98111 22334", company: "Verma Studio", service: services[1], source: "Website Form", submittedAt: "2026-10-07T09:00:00+05:30", status: "Contacted", description: "Looking for a clear, accessible interface for our customer portal.", priority: true, notes: [] },
  { id: "68B19-SWE", name: "Aman Gupta", email: "aman@gmail.com", phone: "+91 98222 33445", company: "Gupta Digital", service: services[2], source: "Website Form", submittedAt: "2026-10-06T11:00:00+05:30", status: "In Progress", description: "We need a custom operations platform to connect our internal workflows.", priority: true, notes: [] },
  { id: "68C32-CLD", name: "Neha Kapoor", email: "neha.k@enterprise.io", phone: "+91 98333 44556", company: "Enterprise Labs", service: services[3], source: "Referral", submittedAt: "2026-10-04T12:00:00+05:30", status: "Converted", description: "Plan a scalable cloud infrastructure for our next product launch.", priority: false, notes: [] },
  { id: "68D45-APP", name: "Vikram Mehta", email: "vikram@techventures.co", phone: "+91 98444 55667", company: "Tech Ventures", service: services[4], source: "Website Form", submittedAt: "2026-09-29T12:00:00+05:30", status: "Closed", description: "Explore a mobile companion app for our existing customer platform.", priority: false, notes: [] },
];
// Fixed fixtures keep build output, dashboard totals, and pagination consistent.
const remaining: [LeadStatus, number][] = [["New", 23], ["Contacted", 37], ["In Progress", 16], ["Converted", 30], ["Closed", 17]];
const firstNames = ["Ananya", "Rohan", "Ishaan", "Kavya", "Arjun", "Meera", "Dev", "Sana"];
const lastNames = ["Patel", "Singh", "Rao", "Das", "Joshi", "Nair", "Shah", "Malhotra"];
const extra: Lead[] = [];
for (const [status, count] of remaining) {
  for (let i = 0; i < count; i++) {
    const index = extra.length;
    const day = String(28 - (index % 25)).padStart(2, "0");
    extra.push({ id: "DEMO-" + String(index + 1).padStart(3, "0"), name: firstNames[index % 8] + " " + lastNames[Math.floor(index / 8) % 8], email: "lead" + (index + 1) + "@example.com", phone: "+91 90000 " + String(index + 1).padStart(5, "0"), company: "Demo Company " + (index + 1), service: services[index % services.length], source: index % 3 === 0 ? "Referral" : "Website Form", submittedAt: "2026-09-" + day + "T12:00:00+05:30", status, description: "A sample enquiry about " + services[index % services.length].toLowerCase() + " for our growing business.", priority: false, notes: [] });
  }
}
export const mockLeads: Lead[] = [...seed, ...extra];
export const leadHref = (id: string) => "/admin/lead/?id=" + encodeURIComponent(id);
export const dateLabel = (value: string, withYear = false) => new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", ...(withYear ? { year: "numeric" as const } : {}), timeZone: "Asia/Kolkata" }).format(new Date(value));
export const noteDateLabel = (value: string) => dateLabel(value) + ", " + new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }).format(new Date(value));
