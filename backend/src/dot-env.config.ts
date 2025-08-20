import dotenv from "dotenv-flow";
import fs from "fs";

if (fs.existsSync(".env") && process.env.NODE_ENV !== "production") {
  console.log("Using .env file to supply config environment variables");
  dotenv.config({ node_env: process.env.NODE_ENV, default_node_env: "development" });
}