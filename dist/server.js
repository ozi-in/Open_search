"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const suggestionRoutes_1 = __importDefault(require("./routes/suggestionRoutes"));
const database_1 = require("./config/database");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use(express_1.default.json());
app.use("/api/suggestions", suggestionRoutes_1.default);
const startServer = async () => {
    try {
        await (0, database_1.connectDatabase)();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV}`);
        });
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
};
startServer();
