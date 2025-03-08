import { createClient } from '@sanity/client'
import { loadSanityTools } from '../sanityTools'
import { createTool } from '@mastra/core/tools'

// Mock dependencies
jest.mock('@sanity/client', () => ({
  createClient: jest.fn().mockReturnValue({
    fetch: jest.fn(),
    getDocument: jest.fn(),
    create: jest.fn(),
    patch: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      commit: jest.fn(),
    }),
    delete: jest.fn(),
  }),
}))

jest.mock('@mastra/core/tools', () => ({
  createTool: jest.fn((config) => ({
    ...config,
    // Simulated tool instance with the config
  })),
}))

describe('sanityTools', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should create tools with the correct configuration', async () => {
    const tools = await loadSanityTools()
    
    // Verify createTool was called for each expected tool
    expect(createTool).toHaveBeenCalledTimes(11) // Updated count to include all tools
    
    // Check that the returned object has all expected tools
    expect(tools).toHaveProperty('listDocuments')
    expect(tools).toHaveProperty('getDocument')
    expect(tools).toHaveProperty('createDocument')
    expect(tools).toHaveProperty('updateDocument')
    expect(tools).toHaveProperty('deleteDocument')
    expect(tools).toHaveProperty('createRelease')
    expect(tools).toHaveProperty('setSandboxMode')
    // New tools
    expect(tools).toHaveProperty('addDocumentsToSelection')
    expect(tools).toHaveProperty('removeDocumentsFromSelection')
    expect(tools).toHaveProperty('clearDocumentSelection')
    expect(tools).toHaveProperty('searchAndSelectDocuments')
  })

  describe('listDocuments tool', () => {
    it('should call client.fetch with the correct parameters', async () => {
      const tools = await loadSanityTools()
      // Fix: Add configuration to createClient call
      const mockClient = createClient({
        projectId: 'mock-project',
        dataset: 'mock-dataset',
        apiVersion: '2025-03-07',
        useCdn: false
      }) as jest.Mocked<any>;
      const mockClientFetch = mockClient.fetch;
      mockClientFetch.mockResolvedValueOnce(['doc1', 'doc2'])
      
      // Get the execute function from the tool config
      const executeListDocs = tools.listDocuments.execute
      
      // Call the tool with sample context
      const result = await executeListDocs({ 
        context: { 
          query: '*[_type == "post"]', 
          params: { limit: 10 } 
        } 
      })
      
      // Verify the client was called correctly
      expect(mockClientFetch).toHaveBeenCalledWith('*[_type == "post"]', { limit: 10 })
      
      // Verify the result format is correct
      expect(result).toEqual({
        documents: ['doc1', 'doc2'],
        success: true
      })
    })
    
    it('should handle errors gracefully', async () => {
      const tools = await loadSanityTools()
      // Fix: Add configuration to createClient call
      const mockClient = createClient({
        projectId: 'mock-project',
        dataset: 'mock-dataset',
        apiVersion: '2025-03-07',
        useCdn: false
      }) as jest.Mocked<any>;
      const mockClientFetch = mockClient.fetch;
      mockClientFetch.mockRejectedValueOnce(new Error('Network error'))
      
      const executeListDocs = tools.listDocuments.execute
      
      const result = await executeListDocs({ 
        context: { 
          query: '*[_type == "post"]'
        } 
      })
      
      expect(result).toEqual({
        error: 'Failed to fetch documents: Network error',
        success: false
      })
    })
  })
  
  // Additional tests for other tools would follow the same pattern
}) 