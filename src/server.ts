import express from "express";
import dotenv from "dotenv";
import suggestionsRoutes from "./routes/suggestionRoutes";
import sequelize, { connectDatabase } from "./config/database";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.use("/api/suggestions", suggestionsRoutes);

const startServer = async () => {
  try {
    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
