import https from "https";
import fs from "fs";
import path from "path";

// Import express library and create a server object
import express from "express";
const app = express();

// Allow incoming request bodies to be refereced as JavaScript objects
app.use(express.json({limit : "50mb"}));

// Define type for possible user IDs
type UserId = "A" | "B";

// Define bundle type
type BundleRecord = Record<string, any>; 

// Define message type
type MessageRecord = {
  from: UserId;
  to: UserId;
  kind: "text" | "file";
  message: any;
};

// Define file type
type StoredFile = {
  fileId: string;
  from: UserId;
  to: UserId;
  ciphertext: string;
};

// Create containers for public key bundles, messages, and files
const bundles : BundleRecord = {};
let messages: MessageRecord[] = [];
let files : StoredFile[] = [];

// Handles when a client uploads their key bundle
app.post("/bundle", (req, res) => {
  const { user, bundle } = req.body;
  bundles[user] = bundle;
  res.status(200).json({success : true});
});

// Handles when a client requests a user's bundle
app.get("/bundle/:user", (req, res) => {
  const bundle = bundles[req.params.user];
  if (!bundle) {
    res.status(404).json({ error: "Bundle not found" });
    return;
  }
  res.json(bundle);
});

// Handles when user wants to send a message
app.post("/send-message", (req, res) => {
  // Testing line to ensure server only sees ciphertext
  console.log("server received encrypted message / file metadata:", req.body);
  
  const {from, to, kind, message} = req.body;
  messages.push({from, to, kind, message});
  res.status(200).json({success : true});
});

// Handles message relay to intended recipient
app.get("/messages/:user", (req, res) => {
  const user = req.params.user;
  const userMessages = messages.filter(m => m.to === user);
  messages = messages.filter(m => m.to !== user);
  res.json(userMessages);
});

// Handles when user wants to send a file
app.post("/upload-file", (req, res) => {
  console.log("server received encrypted file:", req.body);

// Create a file object
  const storedFile: StoredFile = {
    fileId: req.body.fileId,
    from: req.body.from,
    to: req.body.to,
    ciphertext: req.body.ciphertext
};

  // Check if file already exists
  const existingIndex = files.findIndex(
    (f) => f.fileId === storedFile.fileId && f.to === storedFile.to
  );

  // If file already exists, replace it. If not, add to file container.
  if(existingIndex >= 0) {
    files[existingIndex] = storedFile;
  } else {
    files.push(storedFile);
  }

  res.status(200).json({ success : true});
  });

app.get("/download-file/:user/:fileId", (req, res) => {
  const user = req.params.user;
  const {fileId} = req.params;

  // Find encrypted file in storage and return it
  const file = files.find((f) => f.to === user && f.fileId === fileId); 
  res.json(file); 
});

// Build path to certificates folder
const certDir = path.join(process.cwd(), "certs");

// Create https server. Provide server's private key and certificate.
https.createServer(
  {
    key : fs.readFileSync(path.join(certDir, "server-key.pem")),
    cert: fs.readFileSync(path.join(certDir, "server-cert.pem")),
  },
  app
).listen(3000, () => {
    console.log("Server running at https://localhost:3000");
});