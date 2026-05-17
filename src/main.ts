// Import necessary functions from electron and path libraries
import { app, BrowserWindow } from "electron";
import path from "path";

// Handles window pop-up when program is executed
function createWindow(user : string) : void {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    title: `Secure Messenger - User ${user}`,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  });

  // Load html file and pass user ID to the window
  win.loadFile(path.join(__dirname, "../../index.html"), {
    query: {user}
  });
}

// After electron is initialized, create two browser windows and assign each an ID
app.whenReady().then(() => {
  createWindow("A");
  createWindow("B");
});