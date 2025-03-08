import { createTool } from "@mastra/core/tools"
import { createClient } from "@sanity/client"
import { z } from "zod"
import type { DocumentReference } from "../agents/sanityAgent"

// Define Sanity tools using createTool pattern
export async function loadSanityTools(): Promise<Record<string, any>> {
  // Initialize Sanity client
  const client = createClient({
    projectId: process.env.SANITY_PROJECT_ID,
    dataset: process.env.SANITY_DATASET,
    token: process.env.SANITY_TOKEN,
    useCdn: false, // We need fresh data and write access
    apiVersion: process.env.SANITY_API_VERSION || "2025-03-07",
  })

  console.log('Sanity client initialized with project ID:', process.env.SANITY_PROJECT_ID);

  const tools = {
    listDocuments: createTool({
      id: "listDocuments",
      description: "List documents matching a GROQ query",
      inputSchema: z.object({
        query: z.string().describe("GROQ query to filter documents"),
        params: z
          .object({})
          .passthrough()
          .optional()
          .describe("Parameters for the GROQ query"),
      }),
      execute: async ({ context }) => {
        try {
          const { query, params = {} } = context
          const documents = await client.fetch(query, params)
          return { documents, success: true }
        } catch (error) {
          return {
            error: `Failed to fetch documents: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    getDocument: createTool({
      id: "getDocument",
      description: "Get a single document by ID",
      inputSchema: z.object({
        id: z.string().describe("Document ID"),
      }),
      execute: async ({ context }) => {
        try {
          const { id } = context
          const document = await client.getDocument(id)
          if (!document) {
            return {
              error: `Document with ID ${id} not found`,
              success: false,
            }
          }
          return { document, success: true }
        } catch (error) {
          return {
            error: `Failed to get document: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    createDocument: createTool({
      id: "createDocument",
      description: "Create a new document",
      inputSchema: z.object({
        document: z
          .object({
            _type: z.string().describe("Document type (required)"),
          })
          .passthrough()
          .describe("Document data to create"),
        sandboxMode: z
          .boolean()
          .optional()
          .describe("Whether to create in sandbox mode"),
      }),
      execute: async ({ context }) => {
        try {
          const { document, sandboxMode = true } = context

          // Ensure the document has a _type property
          if (!document._type) {
            return {
              error: "Document must have a _type property",
              success: false,
            }
          }

          // In sandbox mode, we just simulate the creation
          if (sandboxMode) {
            return {
              simulatedDocument: { _id: "simulated-id", ...document },
              sandboxed: true,
              success: true,
              message: "Document creation simulated in sandbox mode",
            }
          }

          // Otherwise create for real
          const createdDocument = await client.create(document)
          return { document: createdDocument, success: true }
        } catch (error) {
          return {
            error: `Failed to create document: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    updateDocument: createTool({
      id: "updateDocument",
      description: "Update an existing document",
      inputSchema: z.object({
        id: z.string().describe("Document ID to update"),
        patch: z.object({}).passthrough().describe("Patch object with changes"),
        sandboxMode: z
          .boolean()
          .optional()
          .describe("Whether to update in sandbox mode"),
      }),
      execute: async ({ context }) => {
        try {
          const { id, patch, sandboxMode = true } = context
          // In sandbox mode, just fetch the document and simulate the update
          if (sandboxMode) {
            const document = await client.getDocument(id)
            if (!document) {
              return {
                error: `Document with ID ${id} not found`,
                success: false,
              }
            }

            // Simulate the update by applying the patch
            const simulatedDocument = { ...document, ...patch }

            return {
              simulatedDocument,
              sandboxed: true,
              success: true,
              message: "Document update simulated in sandbox mode",
            }
          }

          // Otherwise update for real
          const updatedDocument = await client.patch(id).set(patch).commit()

          return { document: updatedDocument, success: true }
        } catch (error) {
          return {
            error: `Failed to update document: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    deleteDocument: createTool({
      id: "deleteDocument",
      description: "Delete a document (requires explicit confirmation)",
      inputSchema: z.object({
        id: z.string().describe("Document ID to delete"),
        confirmed: z
          .boolean()
          .describe("Whether deletion is confirmed by user"),
        sandboxMode: z
          .boolean()
          .optional()
          .describe("Whether to delete in sandbox mode"),
      }),
      execute: async ({ context }) => {
        const { id, confirmed, sandboxMode = true } = context
        if (!confirmed) {
          return {
            error: "Deletion requires explicit confirmation",
            success: false,
          }
        }

        try {
          // In sandbox mode, just simulate the deletion
          if (sandboxMode) {
            const document = await client.getDocument(id)
            if (!document) {
              return {
                error: `Document with ID ${id} not found`,
                success: false,
              }
            }

            return {
              simulatedDeletion: { id },
              sandboxed: true,
              success: true,
              message: "Document deletion simulated in sandbox mode",
            }
          }

          // Otherwise delete for real
          await client.delete(id)
          return {
            id,
            success: true,
            message: "Document deleted successfully",
          }
        } catch (error) {
          return {
            error: `Failed to delete document: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    createRelease: createTool({
      id: "createRelease",
      description: "Create a content release for batching changes",
      inputSchema: z.object({
        title: z.string().describe("Title for the release"),
        description: z
          .string()
          .optional()
          .describe("Description of the release"),
      }),
      execute: async ({ context }) => {
        try {
          const { title, description = "" } = context
          // This is a simplified simulation as Releases API varies by Sanity version
          const releaseId = `release-${Date.now()}`
          return {
            release: {
              id: releaseId,
              title,
              description,
              status: "created",
              created: new Date().toISOString(),
            },
            success: true,
          }
        } catch (error) {
          return {
            error: `Failed to create release: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    setSandboxMode: createTool({
      id: "setSandboxMode",
      description: "Toggle sandbox mode to test changes safely",
      inputSchema: z.object({
        enabled: z.boolean().describe("Whether sandbox mode should be enabled"),
      }),
      execute: async ({ context }) => {
        const { enabled } = context
        return {
          sandboxMode: enabled,
          success: true,
          message: `Sandbox mode ${enabled ? "enabled" : "disabled"}`,
        }
      },
    }),

    // New tools for document selection management
    addDocumentsToSelection: createTool({
      id: "addDocumentsToSelection",
      description: "Add documents to the current selection based on a GROQ query",
      inputSchema: z.object({
        query: z.string().describe("GROQ query to find documents to add to selection"),
        params: z
          .object({})
          .passthrough()
          .optional()
          .describe("Parameters for the GROQ query"),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe("Maximum number of documents to add (default: 20)"),
      }),
      execute: async ({ agent, context }) => {
        try {
          const { query, params = {}, limit = 20 } = context
          
          // Get current selection from agent state
          const state = agent.state;
          if (!state || !state.currentSelection) {
            return {
              error: "Could not access agent state",
              success: false,
            }
          }

          // Limit the query to return specific fields we need
          const limitedQuery = `${query}[0...${limit}]{_id, _type, title}`
          
          // Fetch documents
          const documents = await client.fetch(limitedQuery, params)
          
          if (!Array.isArray(documents) || documents.length === 0) {
            return {
              error: "No documents found matching the query",
              success: false,
              documentsFound: 0,
            }
          }

          // Create references for documents to add (avoiding duplicates)
          const existingIds = new Set(state.currentSelection.map(doc => doc.id))
          const now = new Date().toISOString()
          
          const newDocuments: DocumentReference[] = documents
            .filter(doc => !existingIds.has(doc._id))
            .map(doc => ({
              id: doc._id,
              type: doc._type,
              title: doc.title || doc._id,
              lastModified: now
            }))

          // Add to selection
          state.currentSelection = [...state.currentSelection, ...newDocuments]
          
          // Update agent state
          agent.setState(state)

          return {
            success: true,
            documentsAdded: newDocuments.length,
            totalInSelection: state.currentSelection.length,
            addedDocuments: newDocuments.map(doc => ({ id: doc.id, title: doc.title }))
          }
        } catch (error) {
          return {
            error: `Failed to add documents: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    removeDocumentsFromSelection: createTool({
      id: "removeDocumentsFromSelection",
      description: "Remove documents from the current selection based on criteria",
      inputSchema: z.object({
        ids: z
          .array(z.string())
          .optional()
          .describe("Specific document IDs to remove from selection"),
        removeAll: z
          .boolean()
          .optional()
          .describe("Whether to clear the entire selection"),
        condition: z
          .string()
          .optional()
          .describe("GROQ filter condition to match documents for removal"),
      }),
      execute: async ({ agent, context }) => {
        try {
          const { ids, removeAll, condition } = context
          
          // Get current selection from agent state
          const state = agent.state;
          if (!state || !state.currentSelection) {
            return {
              error: "Could not access agent state",
              success: false,
            }
          }

          const originalCount = state.currentSelection.length
          
          if (removeAll) {
            // Clear the entire selection
            state.currentSelection = []
          } else if (ids && ids.length > 0) {
            // Remove specific document IDs
            const idsToRemove = new Set(ids)
            state.currentSelection = state.currentSelection.filter(
              doc => !idsToRemove.has(doc.id)
            )
          } else if (condition) {
            // More complex: get all current IDs, then check which ones match condition
            // For now, implement common cases
            if (condition.includes("type")) {
              // Example: "type != 'author'" or "type == 'post'"
              const typeMatch = condition.match(/type\s*([!=]=)\s*['"]([^'"]+)['"]/i)
              if (typeMatch) {
                const [_, operator, typeName] = typeMatch
                if (operator === "==") {
                  state.currentSelection = state.currentSelection.filter(
                    doc => doc.type === typeName
                  )
                } else if (operator === "!=") {
                  state.currentSelection = state.currentSelection.filter(
                    doc => doc.type !== typeName
                  )
                }
              }
            } else if (condition.includes("title")) {
              // Example: "title contains 'draft'"
              const titleMatch = condition.match(/title\s*(contains)\s*['"]([^'"]+)['"]/i)
              if (titleMatch) {
                const [_, operator, text] = titleMatch
                if (operator === "contains") {
                  state.currentSelection = state.currentSelection.filter(
                    doc => doc.title?.toLowerCase().includes(text.toLowerCase())
                  )
                }
              }
            } else {
              return {
                error: "Unsupported condition syntax",
                success: false,
              }
            }
          } else {
            return {
              error: "No removal criteria specified",
              success: false,
            }
          }
          
          // Update agent state
          agent.setState(state)
          
          const removedCount = originalCount - state.currentSelection.length

          return {
            success: true,
            documentsRemoved: removedCount,
            remainingInSelection: state.currentSelection.length
          }
        } catch (error) {
          return {
            error: `Failed to remove documents: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    clearDocumentSelection: createTool({
      id: "clearDocumentSelection",
      description: "Clear the entire document selection",
      inputSchema: z.object({}),
      execute: async ({ agent }) => {
        try {
          // Get current selection from agent state
          const state = agent.state;
          if (!state) {
            return {
              error: "Could not access agent state",
              success: false,
            }
          }

          const originalCount = state.currentSelection?.length || 0
          
          // Clear the selection
          state.currentSelection = []
          
          // Update agent state
          agent.setState(state)

          return {
            success: true,
            clearedDocuments: originalCount,
            message: "Document selection cleared"
          }
        } catch (error) {
          return {
            error: `Failed to clear selection: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    }),

    searchAndSelectDocuments: createTool({
      id: "searchAndSelectDocuments",
      description: "Search for documents based on criteria and update selection",
      inputSchema: z.object({
        searchQuery: z.string().describe("Natural language search query"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Maximum number of documents to return"),
        replaceSelection: z
          .boolean()
          .optional()
          .describe("Whether to replace the current selection or add to it"),
        documentType: z
          .string()
          .optional()
          .describe("Filter by document type"),
      }),
      execute: async ({ agent, context }) => {
        try {
          const { searchQuery, limit = 10, replaceSelection = false, documentType } = context
          
          // Get current selection from agent state
          const state = agent.state;
          if (!state) {
            return {
              error: "Could not access agent state",
              success: false,
            }
          }
          
          // Convert natural language query to GROQ
          let groqQuery = '*';
          
          // Add type filter if specified
          if (documentType) {
            groqQuery += `[_type == "${documentType}"]`;
          }
          
          // Parse the search query
          if (searchQuery.toLowerCase().includes('recent')) {
            // For "recent" queries, sort by creation date
            groqQuery += ' | order(_createdAt desc)';
          } else if (searchQuery.toLowerCase().includes('tag') || searchQuery.toLowerCase().includes('tagged')) {
            // For tag-related queries, attempt to extract the tag
            const tagMatch = searchQuery.match(/tag(?:ged)?\s+(?:with)?\s+['"]?([a-zA-Z0-9]+)['"]?/i);
            if (tagMatch && tagMatch[1]) {
              const tag = tagMatch[1];
              groqQuery += `[tags[]->tag.value == "${tag}"]`;
            }
          } else if (searchQuery.toLowerCase().includes('title')) {
            // For title searches
            const titleMatch = searchQuery.match(/title\s+(?:contains)?\s+['"]?([^'"]+)['"]?/i);
            if (titleMatch && titleMatch[1]) {
              const titleText = titleMatch[1];
              groqQuery += `[title match "*${titleText}*"]`;
            }
          }
          
          // Add limit and projection
          groqQuery += `[0...${limit}]{_id, _type, title}`;
          
          // Fetch documents
          const documents = await client.fetch(groqQuery);
          
          if (!Array.isArray(documents) || documents.length === 0) {
            return {
              error: "No documents found matching the search criteria",
              success: false,
              documentsFound: 0,
            }
          }
          
          // Create document references
          const now = new Date().toISOString();
          const docRefs: DocumentReference[] = documents.map(doc => ({
            id: doc._id,
            type: doc._type,
            title: doc.title || doc._id,
            lastModified: now
          }));
          
          if (replaceSelection) {
            // Replace current selection
            state.currentSelection = docRefs;
          } else {
            // Add to selection (avoiding duplicates)
            const existingIds = new Set(state.currentSelection.map(doc => doc.id));
            const newDocs = docRefs.filter(doc => !existingIds.has(doc.id));
            state.currentSelection = [...state.currentSelection, ...newDocs];
          }
          
          // Update agent state
          agent.setState(state);
          
          return {
            success: true,
            documentsFound: documents.length,
            documentsSelected: docRefs.length,
            totalInSelection: state.currentSelection.length,
            selectedDocuments: docRefs.map(doc => ({ id: doc.id, title: doc.title, type: doc.type }))
          }
        } catch (error) {
          return {
            error: `Failed to search and select documents: ${(error as Error).message}`,
            success: false,
          }
        }
      },
    })
  }

  return tools
}
