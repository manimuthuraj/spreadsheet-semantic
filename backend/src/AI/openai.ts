import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_APIKEY,
});


export async function createEmbedding(text: any) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: text,
  });

  const embedding = response.data[0].embedding;
  return embedding;
}