// This file is necessary as a result of contextIsolation and nodeIntegration def in main.ts
import { contextBridge } from "electron";

import https from "https";
import fs from "fs";
import path from "path";

// Import functions to be used in renderer.ts
import {
  initializeUser,
  getBundle,
  setBundle,
  buildSession,
  encryptMessage,
  decryptMessage
} from "./crypto/signal";

type UserId = "A" | "B";

// Build path to certificate folder and extract CA certificate
const certDir = path.join(process.cwd(), "certs");
const caCert = fs.readFileSync(path.join(certDir, "ca-cert.pem"));

// Create HTTPS agent. Agent contains CA certificate used for authentication
const agent = new https.Agent({
  ca: caCert,
  rejectUnauthorized : true
});

// Wrapper that handles HTTPS calls
function request(method : string, route : string, body ?: any) : Promise<any> {
  return new Promise((resolve, reject) => {

    // Convert body of request to JSON string
    const data = body ? JSON.stringify(body) : undefined;

    // Create HTTPS request
    const req = https.request(
      {
        hostname : "localhost",
        port : 3000,
        path : route,
        method,
        agent,
        headers : {
          "Content-Type" : "application/json",
          ...(data ? {"Content-Length": Buffer.byteLength(data)} : {})
        }
      },

      // Handles HTTPS response chunks
      (res) => {
        let raw = "";

        res.on("data", (chunk) => {
          raw += chunk;
        });

        res.on("end", () => {
          if(res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            if(!raw) {
              resolve(undefined);
              return;
            }

            try {
              resolve(JSON.parse(raw));
            } catch {
              resolve(raw);
            } 
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
          }
        });
      }
    );

    req.on("error", reject);

    if(data) {
      req.write(data);
    }

    req.end();
  });
}

// Establish secure bridge between signal.ts and renderer.ts
contextBridge.exposeInMainWorld("signal", {
  initializeUser,
  getBundle,
  setBundle,
  buildSession,
  encryptMessage,
  decryptMessage
});

// Allows renderer file to communicate with server
contextBridge.exposeInMainWorld("serverApi", {
  uploadBundle: (user: UserId, bundle: any) =>
    request("POST", "/bundle", { user, bundle }),

  getBundle: (user: UserId) =>
    request("GET", `/bundle/${user}`),

  sendMessage: (from: UserId, to: UserId, kind : "text" | "file", message: any) =>
    request("POST", "/send-message", { from, to, kind, message }),

  getMessages: (user: UserId) =>
    request("GET", `/messages/${user}`),

  uploadFile: (
    fileId: string,
    from: UserId,
    to: UserId,
    ciphertext: string
  ) =>
    request("POST", "/upload-file", {
      fileId,
      from,
      to,
      ciphertext
    }),

  downloadFile: (user: UserId, fileId: string) =>
    request("GET", `/download-file/${user}/${fileId}`)
});

