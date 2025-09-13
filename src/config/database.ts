import { QueryTypes, Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    // Parse the DATABASE_URL format: mysql://root:password@host:port/database
    const url = new URL(process.env.DATABASE_URL);
    return {
      database: url.pathname.slice(1), // Remove leading slash
      username: url.username,
      password: url.password,
      host: url.hostname,
      port: parseInt(url.port),
      dialect: "mysql" as const,
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

  // Fallback to individual environment variables
  return {
    database: process.env.DB_NAME || "ozi_backend",
    username: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306"),
    dialect: "mysql" as const,
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

const sequelize = new Sequelize({
  ...getDatabaseConfig(),
  define: {
    freezeTableName: true, // Preserve table names exactly as specified
  },
});

export default sequelize;

export const connectDatabase = async (): Promise<void> => {
  try {
    console.log("Attempting to connect to database...");

    if (process.env.DATABASE_URL) {
      console.log("Using DATABASE_URL configuration");
      const url = new URL(process.env.DATABASE_URL);
      console.log(`Host: ${url.hostname}`);
      console.log(`Database: ${url.pathname.slice(1)}`);
      console.log(`User: ${url.username}`);
    } else {
      console.log(`Host: ${process.env.DB_HOST || "127.0.0.1"}`);
      console.log(`Database: ${process.env.DB_NAME || "ozi_backend"}`);
      console.log(`User: ${process.env.DB_USER || "root"}`);
    }

    await sequelize.authenticate();
    console.log("Database connection established successfully.");

    // console.log("Checking for search_suggestions table...");
    // try {
    //   const tableExists = await sequelize.query(
    //     "SHOW TABLES LIKE 'search_suggestions'",
    //     { type: QueryTypes.SELECT }
    //   );

    //   if (tableExists.length === 0) {
    //     console.log("Creating search_suggestions table...");
    //     await sequelize.query(`
    //   CREATE TABLE IF NOT EXISTS search_suggestions (
    //     id BIGINT AUTO_INCREMENT PRIMARY KEY,
    //     type VARCHAR(50) DEFAULT 'keyword',
    //     name VARCHAR(255) NOT NULL,
    //     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    //     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    //     INDEX idx_name (name)
    //   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    // `);
    //     console.log(" search_suggestions table created successfully");
    //   } else {
    //     console.log(" search_suggestions table already exists");
    //   }
    // } catch (error) {
    //   console.error("Error creating search_suggestions table:", error);
    // }
    // try {
    //   const terms = await readExcel(process.env.SEARCH_TERMS_EXCEL);

    //   if (terms.length > 0) {
    //     await seedSearchSuggestions(terms);
    //   } else {
    //     console.log(" No terms found in Excel, skipping seeding");
    //   }
    //   await exportSuggestionsForOpenSearch(
    //     process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestion.json"
    //   );
    //   await pushToOpenSearch(
    //     process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestion.json"
    //   );
    // } catch (err) {
    //   console.error(
    //     "Error seeding search_suggestions from Excel to suggestion to index:",
    //     err
    //   );
    // }
    // Disable foreign key checks temporarily
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0");

    // Use simple sync without force or alter to avoid conflicts
    await sequelize.sync({ force: false, alter: false });

    // Re-enable foreign key checks
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1");

    console.log("Database synchronized successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
    throw error;
  }
};
