// Initialize type that holds possible userId's 
type UserId = "A" | "B";

// Initialize window object that contains signal and serverApi objects (from preload.js), that 
// contains all necessary functions from signal.ts/server.ts to be used by renderer. 
interface Window {
    signal: {
    initializeUser: (user: UserId) => Promise<void>;
    getBundle: (user: UserId) => any;
    setBundle: (user: UserId, bundle: any) => void;
    buildSession: (from: UserId, to: UserId) => Promise<void>;
    encryptMessage: (from: UserId, to: UserId, text: string) => Promise<any>;
    decryptMessage: (to: UserId, from: UserId, message: any) => Promise<string>;
    };

    serverApi: {
        uploadBundle : (user : UserId, bundle : any) => Promise<void>;
        getBundle : (user : UserId) => Promise<any>;
        sendMessage : (from : UserId, to : UserId, kind : "text" | "file", message : any) => Promise<void>;
        getMessages : (user : UserId) => Promise<any[]>;
        uploadFile : (
            fileId : string,
            from : UserId, 
            to : UserId,
            ciphertext: string
        ) => Promise<void>;
        downloadFile : (user: UserId, fileId: string) => Promise<any>;
    };
}

// Read window URL, extract user ID (sent from main.ts), and establish user/partner objects
const params = new URLSearchParams(window.location.search);
const user = params.get("user") as UserId;
const partner : UserId = user === "A" ? "B" : "A";

// Reference and update "chatPartner" element within html file
const partnerElement = document.getElementById("chatPartner");
if (partnerElement) {
  partnerElement.textContent = "User " + partner;
}

// Create objects that reference the send button, message input, and messages elements within UI
const sendButton = document.getElementById("sendButton") as HTMLButtonElement;
const messageInput = document.getElementById("messageInput") as HTMLInputElement;
const messages = document.getElementById("messages") as HTMLDivElement;

// Create objects that reference the file input, send button, and file list
const fileInput = document.getElementById("fileInput") as HTMLInputElement | null;
const sendFileButton = document.getElementById("sendFileButton") as HTMLButtonElement | null;
const fileList = document.getElementById("fileList") as HTMLDivElement | null;

// Initialize flag to ensure setup is finalized before messages are sent
let ready = false;

// Handles when the UI needs to be updated with a message
function addBubble(text : string, className : string) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", className);
    bubble.textContent = text;
    messages.appendChild(bubble);
}

// When a file is set, display it on the UI.
function addFileBubble(text: string) {
    const bubble = document.createElement("div");
    bubble.classList.add("message", "receiver-message");
    bubble.textContent = text; 

    if(fileList) {
        fileList.appendChild(bubble);
    } else {
        messages.appendChild(bubble);
    }
}

// When a file is received, create a download button for user
function addDownloadButton(fileName: string, fileSize: number, blob: Blob) {
    // If file list empty
    if(!fileList) return;

    // Create a wrapper object
    const wrapper = document.createElement("div");
    wrapper.classList.add("message", "receiver-message");

    // Create object which identifies which file was received
    const label = document.createElement("div");
    label.textContent = `${fileName} (${fileSize} bytes)`;

    // Create button object that users can interact with 
    const button = document.createElement("button");
    button.textContent = "Download";
    button.style.marginTop = "8px";

    // When button is clicked, allow the receiver to save the file
    button.onclick = () => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Add necessary objects to file area
    wrapper.appendChild(label);
    wrapper.appendChild(button);
    fileList.appendChild(wrapper);
}

// Convert binary values into string so they can be transmitted via JSON
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert string values into binary for encryption/decryption operations
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

// Extract both the ciphertext and tag from the encrypted blob. 
function splitCiphertextAndTag(encrypted: ArrayBuffer) {
  const bytes = new Uint8Array(encrypted);
  const tagLength = 16;

  const ciphertext = bytes.slice(0, bytes.length - tagLength);
  const tag = bytes.slice(bytes.length - tagLength);

  return { ciphertext, tag };
}

// Combine ciphertext and tag for decryption
function combineCiphertextAndTag(ciphertext: Uint8Array, tag: Uint8Array) {
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext, 0);
  combined.set(tag, ciphertext.length);
  return combined;
}

// Function for AES key and iv to eliminate type errors
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

// Setup function. Runs when app starts
async function setup() {
    // Initialize Signal User
    await window.signal.initializeUser(user);

    // Extract user's public bundle
    const myBundle = window.signal.getBundle(user);

    // Send user's bundle to server
    await window.serverApi.uploadBundle(user, myBundle);

    // Extract other user's bundle from server
    let partnerBundle;
    while (!partnerBundle) {
        try {
            partnerBundle = await window.serverApi.getBundle(partner);
        } catch (error) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Store partner's bundle
    window.signal.setBundle(partner, partnerBundle);

    // Update flag to establish the setup process as complete
    ready = true;
}

// Handles when a user presses the UI send button
sendButton.addEventListener("click", async () => {
    // Extract text from UI text bar
    const text = messageInput.value.trim(); 

    // Ensure that text is not empty, and setup has been initialized
    if(!text || !ready) return;
   
    try {
        // initialize variable to hold ciphertext
        let encrypted;

        // If first message, build session and encrypt plaintext
        try {
            encrypted = await window.signal.encryptMessage(user, partner, text);
        } catch(error) {
            console.log("No session established yet. Building one now");
            await window.signal.buildSession(user, partner);
            encrypted = await window.signal.encryptMessage(user, partner, text);
        }

        // Send ciphertext to the server
        await window.serverApi.sendMessage(user, partner, "text", encrypted);

        // Update UI on sender's side and clear text input
        addBubble(text, "sender-message");
        messageInput.value = "";
    } catch (error) {
        console.error("send error", error);
    }
});

// Handles when the send file button is clicked
if (sendFileButton) {
    sendFileButton.addEventListener("click", async () => {
        // Basic checks for file
        if(!ready || !fileInput || !fileInput.files || fileInput.files.length === 0) {
            return;
        }

        try {
            // Extract file and read its contents as bytes
            const file = fileInput.files[0];
            const fileBuffer = await file.arrayBuffer(); 

            // Generate fresh AES key
            const aesKey = await crypto.subtle.generateKey(
                {name: "AES-GCM", length: 256},
                true,
                ["encrypt", "decrypt"]
            );

            // Convert AES key into raw bytes
            const rawKey = await crypto.subtle.exportKey("raw", aesKey);

            // Generate nonce value
            const iv = crypto.getRandomValues(new Uint8Array(12)); 

            // Encrypt the file bytes using AES key and nonce value
            const encryptedFile = await crypto.subtle.encrypt(
                {name : "AES-GCM", iv},
                aesKey,
                fileBuffer
            );

            // Extract ciphertext and authentication tag
            const {ciphertext, tag} = splitCiphertextAndTag(encryptedFile);

            // Convert raw key into byte array
            const rawKeyBytes = new Uint8Array(rawKey);

            // Create unique identifier for file
            const fileId = crypto.randomUUID(); 

            // Upload encrypted file to the server
            await window.serverApi.uploadFile(
                fileId,
                user,
                partner,
                toBase64(ciphertext)
            );

            // Create metadata object
            const metadata = {
                fileId, 
                fileName: file.name,
                mimeType : file.type || "application/octet-stream",
                fileSize: file.size,
                key: toBase64(rawKeyBytes),
                iv: toBase64(iv),
                tag: toBase64(tag)
            };

            // initialize encrypted metadata variable
            let encryptedMetadata;

            try {
                // Encrypt metadata using Signal protocol
                encryptedMetadata = await window.signal.encryptMessage(
                    user, 
                    partner,
                    JSON.stringify(metadata)
                );
            } catch {
                // If no session exists, build one and encrypt metadata
                await window.signal.buildSession(user, partner);
                encryptedMetadata = await window.signal.encryptMessage(
                    user, 
                    partner,
                    JSON.stringify(metadata)
                );
            }

            // Upload metadata to the server
            await window.serverApi.sendMessage(user, partner, "file", encryptedMetadata);
            //addBubble(`Sent file: ${file.name}`, "sender-message");
            fileInput.value = "";
        } catch (error) {
            console.error("file send error", error);
        }
    });
}

// Handles when file has been received by recipient
async function handleIncomingFile(from: UserId, encryptedMetadataMessage: any) {

    // Decrypt metadata object
    const decryptedMetadata = await window.signal.decryptMessage(user, from, encryptedMetadataMessage);

    // Convert decrypted metadata into object
    const metadata = JSON.parse(decryptedMetadata);

    // With fileID extracted, query server for matching file
    const storedFile = await window.serverApi.downloadFile(user, metadata.fileId);

    // Convert following components back into binary values
    const keyBytes = fromBase64(metadata.key);
    const ivBytes = fromBase64(metadata.iv);
    const tagBytes = fromBase64(metadata.tag);
    const ciphertextBytes = fromBase64(storedFile.ciphertext);

    // Recombine ciphertext and tag
    const combined = combineCiphertextAndTag(ciphertextBytes, tagBytes);

    // Convert binary AES key into object that can be used for decryption
    const aesKey = await crypto.subtle.importKey(
      "raw",
      toArrayBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decrypt the file
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv : toArrayBuffer(ivBytes) },
        aesKey,
        toArrayBuffer(combined)
    );

    // Convert decrypted bytes into a blob (file)
    const blob = new Blob([plaintext], { type: metadata.mimeType });

    // Add download button to user interface
    addDownloadButton(metadata.fileName, metadata.fileSize, blob);
}

// Continously check server to see if there is a new message
async function pollMessages() {
    try {
        // Send get request to server for any messages intended for function caller
        const incoming = await window.serverApi.getMessages(user);

        // For each of the received messages, decrypt ciphertext and update UI accordingly
        for (const msg of incoming) {
            if(msg.kind === "text") {
            const decrypted = await window.signal.decryptMessage(user, msg.from, msg.message);
            addBubble(decrypted, "receiver-message");
            } else if(msg.kind === "file") {
                try {
                    await handleIncomingFile(msg.from, msg.message);
                } catch (error) {
                    console.error("file receive error", error);
                    addFileBubble("Failed to decrypt received file");
                }
            }
        }
    } catch (error) {
        console.error("poll error", error);
    }
}

// When program is executed, run setup function then call pollMessages function every second
setup().then(() => {
    setInterval(pollMessages, 1000);
})
    .catch(error => {
    console.error("setup error", error);
  });

