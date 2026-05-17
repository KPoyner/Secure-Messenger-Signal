"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
let messages = [];
app.get("/", (req, res) => {
    res.send("Server is running");
});
app.post("/messages", (req, res) => {
    messages.push(req.body);
    res.sendStatus(200);
});
app.get("/messages", (req, res) => {
    res.json(messages);
});
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});
//# sourceMappingURL=server.js.map