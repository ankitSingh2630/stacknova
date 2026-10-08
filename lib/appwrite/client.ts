"use client";

import { Account, Client, TablesDB } from "appwrite";
import { appwriteConfig } from "./config";

// Reuse this one client for future frontend integrations.
// Initialization alone does not make an Appwrite request.
export const client = new Client()
  .setEndpoint(appwriteConfig.endpoint)
  .setProject(appwriteConfig.projectId);

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
