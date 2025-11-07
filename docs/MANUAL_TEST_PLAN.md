# Manual Test Plan

## Overview
Manual QA scenarios validating the dermatology biologics decision support workflow using seeded mock patients.

## Preconditions
- Application running locally (`npm run dev`).
- Database seeded with `npx prisma db seed`.
- Knowledge base ingested if RAG tests are required.

## Test Scenarios

### 1. Dashboard & Navigation
1. Open `/dashboard`.
2. Verify patient table loads with tier badges.
3. Search for "John" and confirm only John Doe is displayed.
4. Filter by "Non-formulary" and confirm correct patients remain.
5. Click a patient row to navigate to detail view.

### 2. Patient Detail Snapshot
1. For John Doe, confirm current medication, adherence, and formulary tier match seed data.
2. Review medication history entries for methotrexate and Otezla with reasons for discontinuation.
3. Verify recent fills show six entries with correct out-of-pocket values.

### 3. Clinical Assessment Workflow
1. From patient detail, launch "New Clinical Assessment".
2. Complete form fields using scenario-specific data (e.g., PASI 3 for John Doe).
3. Submit and ensure spinner appears while recommendations generate.
4. Confirm navigation to recommendations page after success.

### 4. Recommendations Display
1. Validate stability/formulary badges align with patient scenario.
2. Confirm at least one recommendation card renders with rationale and cost table.
3. If cost data missing, verify qualitative savings message is shown instead of dollar amounts.
4. Select the top recommendation and ensure PATCH request succeeds (check network tab or success redirect).

### 5. Rejection Feedback
1. Reopen recommendations page.
2. Click "Reject All Recommendations".
3. In modal, choose a reason and supply detail fields.
4. Submit and ensure modal closes and toast/confirmation indicates success.

### 6. Success Page
1. After accepting a recommendation, confirm success screen displays chosen therapy and next steps.
2. Verify navigation buttons return to patient profile and dashboard respectively.

### 7. Analytics Dashboard
1. Navigate to `/analytics`.
2. Confirm key metrics populate without runtime errors.
3. Validate bar/pie charts render with data from seeded recommendations.

### 8. Error Handling
1. Attempt to access an invalid patient ID URL and confirm 404-style messaging.
2. Temporarily disable Prisma connection (e.g., change DATABASE_URL) to verify API responds with error JSON.

## Regression Checklist
- Tailwind styles render consistently on mobile and desktop.
- React Query caches patient data and refetches on navigation.
- `npm run test` passes.
- `npm run ingest-knowledge` handles missing Pinecone credentials by throwing descriptive error.
