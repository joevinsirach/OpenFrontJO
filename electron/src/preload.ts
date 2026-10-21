import { contextBridge } from "electron";

// Version label for this wrapper only. Do not assign window.openfrontDesktop:
// that global is the official Steam shell and changes update and payment flow.
contextBridge.exposeInMainWorld("openfrontJo", {
  version: "0.1.0",
});
