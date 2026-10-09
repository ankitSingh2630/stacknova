// These public identifiers configure the Web SDK; never put API keys here.
export const appwriteConfig = {
  enquiryFunctionUrl: process.env.NEXT_PUBLIC_ENQUIRY_FUNCTION_URL || "",
  endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "",
  projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "",
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID || "",
  leadsTableId: process.env.NEXT_PUBLIC_APPWRITE_LEADS_TABLE_ID || "",
  notesTableId: process.env.NEXT_PUBLIC_APPWRITE_NOTES_TABLE_ID || "",
  adminTeamId: process.env.NEXT_PUBLIC_APPWRITE_ADMIN_TEAM_ID || "",
};
