import { QdrantClient } from "@qdrant/js-client-rest";

export const qdrant = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY
})

const collectionName = "superbrain";
// export async function createCollection() {
//     const response = await qdrant.createCollection(collectionName, {
//       vectors: {
//         size: 3072, // dimension of your embeddings
//         distance: "Cosine", // or "Dot", "Euclid"
//       },
//     });
//     console.log(response);
//   }
//   createCollection();


export async function insertPoints(points: any) {
  await qdrant.upsert(collectionName, {
    points,
  });
}

export async function removePoints(ids: string[]) {
  await qdrant.delete(collectionName, {
    points: ids
  })
}


export async function findVector(vector: any, filter: any) {
  const response = await qdrant.search(collectionName, {
    vector, limit: 20, filter
  })
  return response
}

async function createIndex() {
  await qdrant.createPayloadIndex(collectionName, {
    field_name: 'sheetId', field_schema: 'keyword', wait: true,
  });
}
createIndex()