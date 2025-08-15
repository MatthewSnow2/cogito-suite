-- Delete all chunks for this GPT
DELETE FROM document_chunks WHERE custom_gpt_id = 'b2f0e71f-989f-416a-afcc-2cf52aa54d73';

-- Delete all knowledge base entries for this GPT
DELETE FROM knowledge_base WHERE custom_gpt_id = 'b2f0e71f-989f-416a-afcc-2cf52aa54d73';