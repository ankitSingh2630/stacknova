"use client";

import { Account, Client, Functions, TablesDB, Teams } from "appwrite";
import { appwriteConfig } from "./config";

// Reuse this one client for future frontend integrations.
// Initialization alone does not make an Appwrite request.
// Missing configuration must not crash static rendering. Auth helpers reject it
// before any request; they never use the SDK's default endpoint/project.
export const client = new Client();
if (/^https?:\/\//.test(appwriteConfig.endpoint)) client.setEndpoint(appwriteConfig.endpoint);
if (appwriteConfig.projectId) client.setProject(appwriteConfig.projectId);

export const account = new Account(client);
export const tablesDB = new TablesDB(client);
export const teams = new Teams(client);
export const functions = new Functions(client);
