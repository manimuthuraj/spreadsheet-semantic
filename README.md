# spreadsheet-semantic


Semantic Spreadsheet Search Engine
This project implements a semantic search engine for Google Spreadsheets, designed to understand business concepts and process natural language queries, bridging the gap between how users think (e.g., "find profitability metrics") and how spreadsheets store data (cell references, formulas). It leverages AI (Gemini for semantic analysis, embeddings) to interpret spreadsheet content and provide meaningful search results.
Features

Semantic Understanding: Maps spreadsheet headers and formulas to business concepts (e.g., "Q1 Sales" → "Revenue").
Natural Language Queries: Supports conceptual ("show profitability metrics"), functional ("find percentage calculations"), and comparative queries ("budget vs actual").
Cross-Sheet Analysis: Tracks related concepts across multiple sheets (e.g., connecting "Budget" and "Actuals").
Intelligent Result Ranking: Ranks results by semantic relevance, context importance, and formula complexity.
Structured Output: Returns results in JSON with concept names, locations, formulas, BusinessContext, SemanticFormula and explanations.

Tech Stack

Language: TypeScript
Backend: Express.js
Database: MongoDB for metadata storage
Vector Store: Qdrant for semantic search with embeddings
Queue System: BullMQ for asynchronous processing
AI/ML:
Google Gemini (semantic analysis and concept mapping)
OpenAI (text embeddings) And For Evalution


APIs: Google Sheets API for data access
Dependencies: axios, mongoose, @qdrant/js-client-rest, bullmq

Prerequisites

Node.js (v16+)
MongoDB instance
Qdrant instance (cloud or local)
Google Cloud account with Sheets API enabled
API keys for:
Google Gemini (set as GEMINI_API_KEY1, GEMINI_API_KEY2, etc.)
OpenAI (set as OPENAI_API_KEY)
Qdrant (set as QDRANT_API_KEY and QDRANT_URL)


Redis for BullMQ queue management

Setup

Clone the Repository:
git clone <repository-url>
cd semantic-spreadsheet-search


Install Dependencies:
npm install


Configure Environment Variables:Create a .env file in the root directory with:
GEMINI_API_KEY1=<your-gemini-key-1>
GEMINI_API_KEY2=<your-gemini-key-2>
GEMINI_API_KEY3=<your-gemini-key-3>
GEMINI_API_KEY4=<your-gemini-key-4>
OPENAI_API_KEY=<your-openai-key>
QDRANT_URL=<your-qdrant-url>
QDRANT_API_KEY=<your-qdrant-key>
REDIS_HOST=<your-redis-host>
REDIS_PORT=<your-redis-port>
MONGODB_URI=<your-mongodb-uri>
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=<your-redirect-uri>


Start MongoDB and Redis:Ensure MongoDB and Redis are running locally or accessible via provided URIs.

Run the Application:
npm start


Access Bull Board (Queue Monitoring):Open http://localhost:3000/bull-board to monitor job queues.


Usage
API Endpoints

Health Check: GET /health
Returns: { message: 'ok' }


Get OAuth URI: GET /geturi
Returns Google OAuth URL for authentication.


Get Sheets: GET /sheets/load
Returns list of processed spreadsheet jobs.


Parse Sheet: POST /sheet/parse
Body: { spreadsheetId: string }
Queues a job to parse and embed spreadsheet data.


Search Sheet: POST /sheet/search
Body: { spreadsheetId: string, query: string }
Returns semantically relevant results in JSON format.



Example Query
curl -X POST http://localhost:3001/sheet/search \
-H "Content-Type: application/json" \
-d '{"spreadsheetId": "1FAQv7_hkbFKXQC-a57YfNHe89awCzyv9tLxhjR4ez0o", "query": "find profitability metrics"}'

Sample Response:
[
  {
    "concept_name": "Gross Profit Margin",
    "location": { "sheet_name": "P&L Statement", "cell_range": "C15" },
    "value": "35%",
    "formula": "=(B5-B6)/B5",
    "semanticFormula": "Gross Profit Margin = (Revenue - COGS) / Revenue",
    "explanation": "Direct margin calculation showing profitability as percentage of revenue.",
    "BusinessContext": The Gross Profit Margin is a key profitability ratio that indicates the percentage of revenue left after deducting the cost of goods sold (COGS). It measures how efficiently a company is using its direct labor and materials in producing its goods or services. Higher margins typically suggest better operational efficiency in managing direct costs.
    "relevance": "High"
  }
]

Demo Interface
Web UI

Project Structure
├── src/
│   ├── AI/                 # AI-related functions (Gemini, OpenAI)
│   ├── controllers/        # Express route handlers
│   ├── model/             # MongoDB schemas and queries
│   ├── parser/            # Spreadsheet parsing and embedding logic
│   ├── queue.ts/          # BullMQ queue setup
│   ├── vector/            # Qdrant vector store operations
│   ├── types/             # TypeScript interfaces
├── .env                   # Environment variables
├── README.md              # This file
├── package.json           # Dependencies and scripts

Testing

Test Data: Use spreadsheets:
Financial Model: 1FAQv7_hkbFKXQC-a57YfNHe89awCzyv9tLxhjR4ez0o
Sales Dashboard: 14eiRz4_IevXEIWcxkJHALf6jdF6DjF-TGD6FScV7aYo


Test Cases:
Conceptual: "show efficiency ratios" → Finds ROI, ROE.
Functional: "find average formulas" → Identifies AVERAGE, SUM/COUNT.
Comparative: "budget vs actual" → Returns variance calculations.


Comparison: Keyword-based search (e.g., exact text match) vs. semantic search to demonstrate improvement.

Known Limitations

Rate Limits: Gemini API rate limits may slow processing for large spreadsheets. Mitigated with multiple API keys and backoff.
Private Sheets: Currently supports only publicly shared Google Sheets (permission issues for private sheets).
Real-Time Updates: Not fully implemented; relies on manual re-parsing.

Ongoing improvements/Developing:-
Real-Time Updates: Implement webhook-based triggers for spreadsheet changes.
Private Sheet Support: Enhance OAuth flow for private sheet access.
Performance Optimization: Cache frequent queries and pre-compute embeddings for common concepts.

Contributing

Fork the repository.
Create a feature branch (git checkout -b feature/xyz).
Commit changes (git commit -m "Add feature xyz").
Push to the branch (git push origin feature/xyz).
Open a pull request.
