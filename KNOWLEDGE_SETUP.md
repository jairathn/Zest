# Knowledge Base Setup Guide

## Quick Start (In-App Workflow)

1. **Install PDF parsing library:**
   ```bash
   npm install pdf-parse
   ```

2. **Push database schema:**
   ```bash
   npx prisma db push
   ```

3. **Access Knowledge Management:**
   - Navigate to http://localhost:3000/knowledge
   - Or click "Knowledge" in the top navigation

4. **Upload Research Papers:**
   - Click "Upload PDFs" button
   - Select one or more PDF research papers
   - GPT-4 will automatically extract clinical findings
   - Wait ~30 seconds per paper for processing

5. **Review Findings:**
   - Review extracted findings in the list
   - Click "Mark Reviewed" to approve each finding
   - Only reviewed findings should be used in production

6. **Delete Old Chunks (Optional):**
   - If you have old RAG chunks, click "Delete All" to remove them
   - The system will automatically use the new structured findings

## System Behavior

- **Automatic switching:** The system automatically uses structured findings when available
- **Fallback:** Falls back to old RAG chunks if no structured findings exist
- **Logging:** Check console logs to see which method is being used

## Workflow

```
Upload PDFs → GPT-4 Extraction → Save to DB → Review → Use in Recommendations
```

## Benefits

✅ Clean, physician-ready citations
✅ Complete sentences (no truncation)
✅ No metadata noise
✅ Human review workflow
✅ No hallucinations (grounded in papers)

## Next Steps

After uploading and reviewing findings:
1. Test with a patient assessment
2. Verify recommendations cite structured findings
3. Review citation quality
4. Approve for production use
