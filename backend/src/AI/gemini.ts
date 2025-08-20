import { GoogleGenAI, Type } from '@google/genai';
import { IsHeaderPayload } from '../types';
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY1,
  process.env.GEMINI_API_KEY2,
  process.env.GEMINI_API_KEY3,
  process.env.GEMINI_API_KEY4
];

let currentKeyIndex = 0;
const callsPerKey = new Array(GEMINI_API_KEYS.length).fill(0); // Track calls per key
const MAX_CALLS_PER_KEY = 8;
const TOTAL_MAX_CALLS_PER_MINUTE = MAX_CALLS_PER_KEY * GEMINI_API_KEYS.length; // 32
let totalCallsInMinute = 0;
let lastMinuteTimestamp = Date.now();

async function getNextGeminiClient() {
  // Check if we need to reset minute counter
  if (Date.now() - lastMinuteTimestamp >= 60000) {
    totalCallsInMinute = 0;
    callsPerKey.fill(0);
    lastMinuteTimestamp = Date.now();
  }

  // If total calls exceed limit, wait 30 seconds
  if (totalCallsInMinute >= TOTAL_MAX_CALLS_PER_MINUTE) {
    console.log('Total calls exceeded (32/min). Waiting 30 seconds...');
    await sleep(40000);
    totalCallsInMinute = 0;
    callsPerKey.fill(0);
    lastMinuteTimestamp = Date.now();
  }

  // Find a key with available calls
  let attempts = 0;
  while (attempts < GEMINI_API_KEYS.length) {
    if (callsPerKey[currentKeyIndex] < MAX_CALLS_PER_KEY) {
      callsPerKey[currentKeyIndex]++;
      totalCallsInMinute++;
      console.log(`Using key ${currentKeyIndex + 1}, call ${callsPerKey[currentKeyIndex]} of ${MAX_CALLS_PER_KEY}`);
      return new GoogleGenAI({ apiKey: GEMINI_API_KEYS[currentKeyIndex] });
    }
    currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
    attempts++;
  }

  // If all keys are at limit (shouldn't happen due to total check), wait
  console.log('All keys at per-key limit. Waiting 30 seconds...');
  await sleep(30000);
  callsPerKey.fill(0);
  totalCallsInMinute = 0;
  lastMinuteTimestamp = Date.now();
  return getNextGeminiClient();
}


const model = 'gemini-2.5-flash'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function isHeader(headers: IsHeaderPayload, retries: number = 3) {
  console.log(headers.thisSheetTitle)
  // await sleep(10000);
  try {


    const prompt = `
   You are given the horizontal and vertical headers of a spreadsheet.

   Your task is to determine whether the vertical header is truly a "header" (i.e., labels describing rows), or if it's just regular data.

   Return the result ONLY as valid JSON:
   { "isVerticalHeader": true, sheetName: thisSheetName, reason: "reason for vertical header" } or { "isVerticalHeader": sheetName: thisSheetName }

   Here is the header object:
   ${JSON.stringify(headers, null, 2)}
  `;

    const ai = await getNextGeminiClient()

    const result = await ai.models.generateContent({
      model, contents: prompt, config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          type: Type.OBJECT,
          properties: {
            isVerticalHeader: {
              type: Type.BOOLEAN,
            },
            sheetName: { type: Type.STRING },
            reason: { type: Type.STRING }
          }
        }
      }
    });
    const text = result.text;

    // Optional: Try to safely parse the response
    try {
      console.log(text)
      const parsed = JSON.parse(text ?? "{}");
      return parsed
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", text);
    }

  } catch (error) {
    console.log(error)
    // @ts-expect-error If error is "rate limit" or HTTP 429, wait and retry
    if ((error?.status === 429) && retries > 0) {
      console.warn("Rate limit hit. Waiting 60s before retry...");
      await sleep(60000); // wait 1 minute
      return isHeader(headers, retries - 1);
    }
    throw error;
  }

}

export async function embedding(contents: any) {

  const ai = await getNextGeminiClient()
  const response = await ai.models.embedContent({
    model: 'gemini-embedding-exp-03-07',
    contents,
  });

  return response.embeddings
}


export async function headerBussinessMapping(headers: any, spreadSheetName?: string, spreadsheets?: any, retries: number = 3) {
  // await sleep(10000);
  const prompt = `
   You are a world-class semantic business analyst.

   Given a spreadsheet column header from any domain (finance, sales, HR, marketing, logistics, SaaS, etc.), your task is to infer and map **the most likely business concept it represents**, even if it is obscure, implicit, or poorly labeled.

   Return:
    - "concept": The business concept it most likely represents or relates to (e.g. "Customer Lifetime Value", "Operating Expenses", "Churn Rate", "Budget Variance", "Conversion Funnel", "ESG Score")
    - "description": A detailed explanation of what this header likely represents or calculates in a business context
    - "synonyms": A list of related search terms, labels, or business phrases a user might use
    - "metricType": One of ["Financial Metric", "Ratio", "Time Period", "Label/Category", "Entity Name", "Dimension", "Formula", "Date", "Boolean", "Text", "Other"]

   Here is the header object:
   ${JSON.stringify(headers, null, 2)}

   spreadsheet ${spreadSheetName}
   spreadsheetsNames ${JSON.stringify(spreadsheets)}
`;

  const ai = await getNextGeminiClient()
  const result = await ai.models.generateContent({
    model, contents: prompt, config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          headers: {
            type: "array",
            items: {
              type: "object",
              properties: {
                location: { type: "string" },
                value: { type: "string" },
                formula: { type: ["string", "null"] },
                sheetName: { type: "string" },
                concept: { type: "string" },
                description: { type: "string" },
                synonyms: {
                  type: "array",
                  items: { type: "string" }
                },
                metricType: { type: "string" },
                layout: { type: "string", enum: ["horizontal", "vertical"] }
              },
              required: [
                "location",
                "value",
                "sheetName",
                "concept",
                "description",
                "synonyms",
                "layout"
              ]
            }
          }
        },
        required: ["headers"]
      }

    }
  });
  const text = result.text;

  // Optional: Try to safely parse the response
  try {
    console.log(text)
    const parsed = JSON.parse(text ?? "{}");
    return parsed
  } catch (e) {
    console.error("Failed to parse Gemini response as JSON:", text);
    // @ts-expect-error If error is "rate limit" or HTTP 429, wait and retry
    if ((error?.status === 429) && retries > 0) {
      console.warn("Rate limit hit. Waiting 60s before retry...");
      await sleep(60000); // wait 1 minute
      return headerBussinessMapping(headers, spreadSheetName, spreadsheets, retries - 1);
    }
  }


}

export async function formulaBussinessMapping(formula: any, headers: any, spreadSheetName: string, spreadsheets: any, retries: number = 3) {
  // await sleep(10000);
  try {

    const prompt = `
  Given the spreadsheet formula, map the involved columns to their business concepts and describe what the formula computes in business terms.

  For each formula, generate:
  - Not only natural language description of what the formula does also its concept and sematic formula with actual header example: Revenue=Year2-Year1.
  - The "semanticFormula": replace cell references with their associated business concepts from headers.
  - Refer to both the row and column headers for accurate meaning.
  - If external sheets are used (e.g., '3-Year Forecast'), reference those headers and concepts.

  Return as structured JSON:
  {
    "formula": "...",
    "semanticFormula": "...",
    "description": "..."
  }

  here is the formula:
  ${JSON.stringify(formula, null, 2)}

  Here is the header object:
  ${JSON.stringify(headers, null, 2)}
  
  spreadsheet ${spreadSheetName}
  spreadsheetsNames ${JSON.stringify(spreadsheets)}
  `;

    const ai = await getNextGeminiClient()
    const result = await ai.models.generateContent({
      model, contents: prompt, config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          "type": "object",
          "properties": {
            "formula": {
              "type": "string",
            },
            "semanticFormula": {
              "type": "string",
              "description": "A human-readable, business-contextual description of the formula using header concepts (e.g., Revenue (Year 2) minus Revenue (Year 1))"
            },
            "description": {
              "type": "string",
              "description": "A detailed explanation of what the formula calculates in business terms"
            }
          },
          "required": ["formula", "semanticFormula", "description"],
        }

      }
    });
    const text = result.text;

    // Optional: Try to safely parse the response
    try {
      console.log(text)
      const parsed = JSON.parse(text ?? "{}");
      return parsed
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", text);
      // @ts-expect-error If error is "rate limit" or HTTP 429, wait and retry
      if ((error?.status === 429) && retries > 0) {
        console.warn("Rate limit hit. Waiting 60s before retry...");
        await sleep(60000); // wait 1 minute
        return formulaBussinessMapping(formula, headers, spreadSheetName, spreadsheets, retries - 1);
      }
    }
  } catch (error) {
    console.log(error, "error123")
  }

}


// export async function searchSheet(userQuery: any, inferredQuery: any, data: any) {
//   try {

//     const prompt = `
//        You are a semantic spreadsheet assistant helping users find meaningful business concepts in spreadsheets.

//        ## Context
//        You have received the following:
//        - **User Query**: "${userQuery}"
//        - **infered Query: ${inferredQuery?.query}
//        - **Matched Spreadsheet Segments**: These come from Qdrant vector search
//        data is ${JSON.stringify(data)}

//        ## Your Tasks
//        1️⃣ **Understand the Query**  
//        - Interpret the user’s intent and what business concepts they want to find.

//        2️⃣ **Analyze Each Segment**  
//        - For each segment, determine:
//           - What business concept it represents
//           - Why it is relevant (or not) to the user query
//           - How strong the match is (high/medium/low relevance)

//        3️⃣ **Rank and Filter**  
//        - Keep only the segments that meaningfully match the user query.
//        - Rank the matches by semantic relevance.

//        4️⃣ **Generate Clear Output**  
//        - For each relevant match, output:
//          - **Concept Name**
//          - **Location** ('sheet_name' and 'cell_range')
//          -**value**
//          - **Formula**
//          - **semanticFormula**
//          - **Explanation**: Why this is relevant to the query
//          - **Relevance Score** (High/Medium/Low)

//        5️⃣ **Output Format**  
//        Return the results as structured **JSON**, grouped by business concept, with clear fields:
//        'json'
//        [
//          {
//            "concept_name": "Gross Profit Margin",
//            "location": {
//              "sheet_name": "P&L Statement",
//              "cell_range": "C15:C20"
//            },
//            value: "value of the cell",
//            "formula": "=(Revenue-COGS)/Revenue",
//            "semanticFormula": 'if exist',
//            "explanation": "Direct margin calculation showing profitability as percentage of revenue.",
//            "relevance": "High"
//          },
//          ...
//        ]
//         `

//     const ai = await getNextGeminiClient()
//     const result = await ai.models.generateContent({
//       model, contents: prompt, config: {
//         responseMimeType: "application/json",    
//       }
//     });
//     //   console.log(prompt, "prompt")
//     const text = result.text;

//     // Optional: Try to safely parse the response
//     try {
//       console.log(text)
//       const parsed = JSON.parse(text ?? "{}");
//       return parsed
//     } catch (e) {
//       console.error("Failed to parse Gemini response as JSON:", text);
//       // return { error: "Parsing failed", raw: text };
//     }
//   } catch (error) {
//     console.log(error, "error123")
//     throw error
//   }

// }


export async function searchSheet(userQuery: any, headers: any, sheetNames: any, formula: any, data: any) {
  try {

    const prompt = `You are a **semantic spreadsheet assistant** that helps users explore spreadsheets to uncover **business concepts, functional insights, and comparative analysis**.
## Context
You have received:
- **User Query**: '${userQuery}'
Below Meta Data
- **headers**: ${JSON.stringify(headers)}
-**sheetNames**: ${JSON.stringify(sheetNames)}
-**formula**: ${JSON.stringify(formula)}
- **Matched Spreadsheet Segments**: Retrieved from Qdrant vector search.  
  Data: ${JSON.stringify(data)}

---

## Your Tasks

### 1️⃣ Understand the Query
- Identify whether the query is:
  - **Conceptual** → User is asking about a business metric, ratio, or concept (e.g., *"What is EBITDA margin?"*).
  - **Functional** → User wants a calculation, trend, or breakdown from the sheet (e.g., *"Show me quarterly revenue growth"*).
  - **Comparative** → User wants a comparison across years, sheets, or categories (e.g., *"Compare FY22 vs FY23 net profit"*).

### 2️⃣ Analyze Each Segment
For each segment:
- Determine:
  - The **business concept** it represents
  - Why it is relevant (or not) to the user query
  - Strength of match (**High / Medium / Low relevance**)

### 3️⃣ Rank & Filter
- Keep only meaningful matches.
- Rank by **semantic relevance** to the query.
-**Ranking Factors:**
  - **Semantic Relevance**: How closely does content match the concept?
  - **Context Importance**: Is this a key metric or supporting calculation?
  - **Formula Complexity**: More sophisticated calculations might be more relevant

### 4️⃣ Generate Insightful Output
For each relevant match, return:
- **Concept Name**
- **Location**: { sheet_name, cell_range }
- **Value**
- **Formula** (if present in sheet)
- **Business Context**: What role this plays in the spreadsheet
- **Semantic Formula** (business-level formula, e.g., “EBITDA = Operating Profit + Depreciation + Amortization”)
- **Explanation**: Plain-language reasoning why it’s relevant
- **Relevance Score**

If query type is:
- **Conceptual** → Output a definition + mapped spreadsheet values.
- **Functional** → Perform the calculation/extract the trend using spreadsheet values.
- **Comparative** → Show side-by-side comparisons across periods/sheets.

### 5️⃣ Output Format
Return structured JSON, grouped by **Bussiness Concepts**, like this:

json
      
         [
          {
            "concept_name": "Net Profit",
            "location": { "sheet_name": "P&L Statement", "cell_range": "D15:D16" },
            "value": { "FY22": "₹1,200,000", "FY23": "₹1,450,000" },
            "formula": "=Revenue - Expenses",
            "BusinessContext: '',
            "semanticFormula": "Net Profit = Revenue - Total Expenses",
            "explanation": "Comparison of net profit year over year.",
            "relevance": "High"
          }
        ]
    
    `

    const ai = await getNextGeminiClient()
    const result = await ai.models.generateContent({
      model, contents: prompt, config: {
        responseMimeType: "application/json",
      }
    });

    const text = result.text;

    try {
      console.log(text)
      const parsed = JSON.parse(text ?? "{}");
      return parsed
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", text);
      // return { error: "Parsing failed", raw: text };
    }
  } catch (error) {
    console.log(error, "error123")
    throw error
  }

}



export async function makeQuery(userQuery: any, headers: any, sheetnames: any, formulas: any) {
  try {
    const prompt = `
       You are a semantic spreadsheet assistant helping users find meaningful business concepts in spreadsheets.
       
       ## Context
       You have received the following:
       - ** User Query **: "${userQuery}

       ## Your Tasks
    1️⃣ ** give me detailed query, i will fetch from QdrantDB what user wants and from headers: ${JSON.stringify(headers)}, sheetnames: ${JSON.stringify(sheetnames)}, and formuls:${JSON.stringify(formulas)}
    'json
    {
      query: userQuery
        `
    const ai = await getNextGeminiClient()
    const result = await ai.models.generateContent({
      model, contents: prompt, config: {
        responseMimeType: "application/json",
        responseJsonSchema: {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
            },
          },

        },
      }
    });
    const text = result.text;

    try {
      console.log(text)
      const parsed = JSON.parse(text ?? "{}");
      return parsed
    } catch (e) {
      console.error("Failed to parse Gemini response as JSON:", text);
    }
  } catch (error) {
    console.log(error, "error123")
    throw error
  }

}

