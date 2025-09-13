"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDatabase = void 0;
const sequelize_1 = require("sequelize");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const getDatabaseConfig = () => {
    if (process.env.DATABASE_URL) {
        const url = new URL(process.env.DATABASE_URL);
        return {
            database: url.pathname.slice(1),
            username: url.username,
            password: url.password,
            host: url.hostname,
            port: parseInt(url.port),
            dialect: "mysql",
            logging: false,
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000,
            },
            dialectOptions: {
                connectTimeout: 60000,
                ssl: {
                    rejectUnauthorized: false,
                },
            },
        };
    }
    return {
        database: process.env.DB_NAME || "ozi_backend",
        username: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "",
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "3306"),
        dialect: "mysql",
        logging: false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000,
        },
        dialectOptions: {
            connectTimeout: 60000,
        },
    };
};
const sequelize = new sequelize_1.Sequelize({
    ...getDatabaseConfig(),
    define: {
        freezeTableName: true,
    },
});
exports.default = sequelize;
const connectDatabase = async () => {
    try {
        console.log("Attempting to connect to database...");
        if (process.env.DATABASE_URL) {
            console.log("Using DATABASE_URL configuration");
            const url = new URL(process.env.DATABASE_URL);
            console.log(`Host: ${url.hostname}`);
            console.log(`Database: ${url.pathname.slice(1)}`);
            console.log(`User: ${url.username}`);
        }
        else {
            console.log(`Host: ${process.env.DB_HOST || "127.0.0.1"}`);
            console.log(`Database: ${process.env.DB_NAME || "ozi_backend"}`);
            console.log(`User: ${process.env.DB_USER || "root"}`);
        }
        await sequelize.authenticate();
        console.log("Database connection established successfully.");
        await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");
        await sequelize.sync({ force: false, alter: false });
        await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");
        console.log("Database synchronized successfully.");
    }
    catch (error) {
        console.error("Unable to connect to the database:", error);
        throw error;
    }
};
exports.connectDatabase = connectDatabase;
