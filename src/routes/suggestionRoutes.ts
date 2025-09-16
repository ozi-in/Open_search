import { Router } from "express";
import {
  readExcel,
  seedSearchSuggestions,
  exportSuggestionsForOpenSearch,
  pushSuggestionorCategoriesToOpenSearch,
  exportCatalogForOpenSearch,
  pushCatalogDataToOpenSearch,
} from "../services/suggestionService";

const router = Router();
router.get("/test", (req, res) => {
  res.json({ message: "Auth route test endpoint working" });
});

router.post("/seed-suggestion", async (req, res) => {
  try {
    const terms = await readExcel(process.env.SEARCH_TERMS_EXCEL);
    await seedSearchSuggestions(terms);
    res.json({ success: true, message: "Seeded successfully" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export-suggestion", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
    const count = await exportSuggestionsForOpenSearch(filePath);
    res.json({ success: true, count, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export-categories", async (req, res) => {
  try {
    const filePath =
      process.env.OPEN_SEARCH_CATEGORY_PATH || "./uploads/bulk_categories.json";
    const count = await exportCatalogForOpenSearch(filePath);
    res.json({ success: true, count, filePath });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/push-suggestion", async (req, res) => {
  try {
    // First export suggestions
    const filePath =
      process.env.OPEN_SEARCH_PATH || "./uploads/bulk_suggestions.json";
    const count = await exportSuggestionsForOpenSearch(filePath);

    // Then push the exported suggestions
    const response = await pushSuggestionorCategoriesToOpenSearch(filePath);

    res.json({
      success: true,
      exportCount: count,
      pushResponse: response,
      filePath
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/push-categories", async (req, res) => {
  try {
    // First export categories
    const filePath =
      process.env.OPEN_SEARCH_CATEGORY_PATH || "./uploads/bulk_categories.json";
    const count = await exportCatalogForOpenSearch(filePath);

    // Then push the exported categories
    const response = await pushSuggestionorCategoriesToOpenSearch(filePath);

    res.json({
      success: true,
      exportCount: count,
      pushResponse: response,
      filePath
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/push-categories-direct", async (req, res) => {
  try {
    // Delete existing index, fetch data from database, format to JSON, and push directly to OpenSearch
    const result = await pushCatalogDataToOpenSearch();

    res.json({
      success: true,
      categoryCount: result.categoryCount,
      productCount: result.productCount,
      totalCount: result.totalCount,
      deleteResult: result.deleteResult,
      pushResponse: result.response,
      message: "Index deleted and data pushed directly to OpenSearch without creating file"
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
